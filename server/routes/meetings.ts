import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  createMeetingInputSchema,
  type Meeting,
  type MeetingListItem,
} from "../../shared/schemas.js";
import { isStalled } from "../../shared/status.js";
import type { AppDeps } from "../deps.js";
import { clientIpHash } from "../http/clientIp.js";
import { meetingNotFound, validationHook } from "../http/errors.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { processMeeting } from "../pipeline/processMeeting.js";
import type { MeetingRow } from "../repo/types.js";

// The only place that shapes a Meeting, so internal columns never leak.
function toMeeting(row: MeetingRow, now: Date): Meeting {
  const {
    createdIpHash: _ipHash,
    deletedAt: _deletedAt,
    processingStartedAt,
    createdAt,
    updatedAt,
    ...rest
  } = row;
  return {
    ...rest,
    processingStartedAt: processingStartedAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    stalled: isStalled(row, now),
  };
}

// Replaced by the LLM title after summarizing, unless the user typed one.
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
    .post("/:id/process", async (c) => {
      const row = await processMeeting(deps, c.req.param("id"));
      return c.json(toMeeting(row, now()));
    })
    .delete("/:id", async (c) => {
      const id = c.req.param("id");
      const row = await repo.get(id);
      if (!row || !(await repo.delete(id))) throw meetingNotFound();
      // Best effort: an orphaned blob is cheaper than a meeting that can't be deleted.
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
