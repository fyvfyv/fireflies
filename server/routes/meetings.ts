import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  createMeetingInputSchema,
  type Meeting,
  type MeetingListItem,
  type StoredSummary,
  type Summary,
} from "../../shared/schemas.js";
import { isStalled } from "../../shared/status.js";
import type { AppDeps } from "../deps.js";
import { clientIpHash } from "../http/clientIp.js";
import { meetingNotFound, validationHook } from "../http/errors.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { processMeeting } from "../pipeline/processMeeting.js";
import { regenerateNotes } from "../pipeline/regenerateNotes.js";
import type { MeetingRow } from "../repo/types.js";

function withSummaryDefaults(summary: StoredSummary): Summary {
  return {
    ...summary,
    keywords: summary.keywords ?? [],
    notes: summary.notes ?? [],
    actionItems: summary.actionItems.map((item) => ({
      ...item,
      startSecond: item.startSecond ?? null,
    })),
  };
}

// The only place that shapes a Meeting, so internal columns never leak.
function toMeeting(row: MeetingRow, now: Date): Meeting {
  const {
    createdIpHash: _ipHash,
    deletedAt: _deletedAt,
    processingStartedAt,
    createdAt,
    updatedAt,
    summary,
    ...rest
  } = row;
  return {
    ...rest,
    summary: summary && withSummaryDefaults(summary),
    processingStartedAt: processingStartedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    stalled: isStalled(row, now),
  };
}

function defaultTitle(now: Date): string {
  return `Recording ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function meetingsRoutes(deps: AppDeps) {
  const { repo, storage, now, log } = deps;

  return new Hono()
    .post(
      "/",
      zValidator("json", createMeetingInputSchema, validationHook),
      rateLimit(deps),
      async (c) => {
        const { title, durationSeconds, ...input } = c.req.valid("json");
        const at = now();
        const row = await repo.create({
          ...input,
          title: title || defaultTitle(at),
          titleEdited: Boolean(title),
          durationSeconds: durationSeconds ?? null,
          createdIpHash: clientIpHash(c.req.header("x-forwarded-for")),
        });
        return c.json(toMeeting(row, at), 201);
      },
    )
    .get("/", async (c) => {
      const at = now();
      const rows = await repo.list();
      return c.json(
        rows.map(
          ({
            processingStartedAt,
            createdAt,
            updatedAt,
            ...rest
          }): MeetingListItem => ({
            ...rest,
            stalled: isStalled({ ...rest, processingStartedAt }, at),
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          }),
        ),
      );
    })
    .get("/:id", async (c) => {
      const row = await repo.get(c.req.param("id"));
      if (!row) throw meetingNotFound();
      return c.json(toMeeting(row, now()));
    })
    .get("/:id/audio", async (c) => {
      const row = await repo.get(c.req.param("id"));
      if (!row) throw meetingNotFound();
      const audio = await storage.audioUrl(row.audioPathname);
      // The URL works as a short-lived credential, so no cache may keep it.
      c.header("Cache-Control", "private, no-store");
      return c.json(audio);
    })
    .post("/:id/process", async (c) => {
      const row = await processMeeting(deps, c.req.param("id"));
      return c.json(toMeeting(row, now()));
    })
    .post("/:id/notes", async (c) => {
      // Not rate limited: only legacy summaries qualify, so it limits itself.
      const row = await regenerateNotes(deps, c.req.param("id"));
      return c.json(toMeeting(row, now()));
    })
    .delete("/:id", async (c) => {
      const id = c.req.param("id");
      const row = await repo.get(id);
      if (!row || !(await repo.delete(id))) throw meetingNotFound();
      await storage.delete(row.audioPathname).catch((err: unknown) => {
        log({
          level: "warn",
          msg: "audio delete failed",
          meetingId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return c.body(null, 204);
    });
}
