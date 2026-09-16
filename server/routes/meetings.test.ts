import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEASE_MS } from "../../shared/constants.js";
import {
  meetingListItemSchema,
  meetingSchema,
  type Summary,
} from "../../shared/schemas.js";
import { createApp } from "../app.js";
import type { AppDeps } from "../deps.js";
import { SummaryError } from "../services/types.js";
import { memoryStorage } from "../storage/memoryStorage.js";
import { postJson, validCreateBody } from "../test/requests.js";
import { testDeps } from "../test/testDeps.js";

const T0 = new Date("2026-09-16T12:00:00.000Z");

const summary: Summary = {
  title: "Standup",
  overview: "o".repeat(200),
  keyTakeaways: ["a"],
  decisions: [],
  actionItems: [
    { task: "one", owner: null, due: null },
    { task: "two", owner: "Ana", due: "Friday" },
  ],
};

describe("meetings routes", () => {
  let clock: Date;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  const tick = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  beforeEach(() => {
    clock = T0;
    const storage = memoryStorage();
    storage.put(validCreateBody.audioPathname, {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: validCreateBody.contentType,
    });
    deps = testDeps({ now: () => clock, storage });
    app = createApp(deps);
  });

  const create = async (body: object = {}) => {
    const res = await postJson(app, "/api/meetings", {
      ...validCreateBody,
      ...body,
    });
    expect(res.status).toBe(201);
    return meetingSchema.parse(await res.json());
  };

  describe("POST /meetings", () => {
    it("creates an uploaded meeting with a server default title", async () => {
      const res = await postJson(app, "/api/meetings", validCreateBody);

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).not.toHaveProperty("createdIpHash");
      const meeting = meetingSchema.parse(body);
      expect(meeting).toMatchObject({
        status: "uploaded",
        titleEdited: false,
        title: "Recording 2026-09-16 12:00 UTC",
        source: "mic",
        audioPathname: "recordings/a.webm",
        durationSeconds: null,
        attempts: 0,
        stalled: false,
        createdAt: T0.toISOString(),
      });
      expect(await deps.repo.get(meeting.id)).not.toBeNull();
    });

    it("keeps a typed title and marks it as edited", async () => {
      const meeting = await create({ title: "  Weekly sync  " });

      expect(meeting).toMatchObject({
        title: "Weekly sync",
        titleEdited: true,
      });
    });

    it("treats a blank title as no title", async () => {
      const meeting = await create({ title: "   " });

      expect(meeting.titleEdited).toBe(false);
      expect(meeting.title).toMatch(/^Recording /);
    });

    it("persists the recorder duration when given", async () => {
      const meeting = await create({ durationSeconds: 42.5 });

      expect(meeting.durationSeconds).toBe(42.5);
      expect((await deps.repo.get(meeting.id))?.durationSeconds).toBe(42.5);
    });

    it("rejects a body without audioPathname with a validation envelope", async () => {
      const { audioPathname: _, ...body } = validCreateBody;
      const res = await postJson(app, "/api/meetings", body);

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: {
          code: "validation",
          message: expect.stringContaining("audioPathname"),
          retryable: false,
        },
      });
    });

    it.each(["recordings/../secrets.webm", "recordings/nested/a.webm"])(
      "rejects the pathname %s, which no upload token allows",
      async (audioPathname) => {
        const res = await postJson(app, "/api/meetings", {
          ...validCreateBody,
          audioPathname,
        });

        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({
          error: { code: "validation" },
        });
      },
    );

    it("rejects malformed JSON as a client error", async () => {
      const res = await app.request("/api/meetings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        error: { code: "bad_request", retryable: false },
      });
    });
  });

  describe("GET /meetings", () => {
    it("lists newest first with the projection fields only", async () => {
      const first = await create({ title: "First" });
      await deps.repo.update(first.id, { status: "done", summary });
      tick(1000);
      const second = await create({ title: "Second" });

      const res = await app.request("/api/meetings");

      expect(res.status).toBe(200);
      // Raw keys, because parsing strips unknown ones.
      const body = (await res.json()) as object[];
      const items = meetingListItemSchema.array().parse(body);
      expect(items.map((item) => item.id)).toEqual([second.id, first.id]);
      expect(Object.keys(body[0] ?? {}).sort()).toEqual(
        Object.keys(meetingListItemSchema.shape).sort(),
      );
      expect(items[1]).toMatchObject({
        title: "First",
        status: "done",
        overviewSnippet: "o".repeat(140),
        actionItemCount: 2,
        stalled: false,
      });
      expect(items[0]).toMatchObject({
        overviewSnippet: null,
        actionItemCount: 0,
      });
    });

    it("flags in-progress rows whose lease has expired", async () => {
      const meeting = await create();
      await deps.repo.claimLease(meeting.id, clock, 1);
      await deps.repo.update(meeting.id, { status: "transcribing" });
      tick(LEASE_MS + 1);

      const res = await app.request("/api/meetings");

      const [item] = meetingListItemSchema.array().parse(await res.json());
      expect(item?.stalled).toBe(true);
    });
  });

  describe("GET /meetings/:id", () => {
    it("returns the meeting", async () => {
      const meeting = await create({ title: "Mine" });

      const res = await app.request(`/api/meetings/${meeting.id}`);

      expect(res.status).toBe(200);
      // Raw keys, because parsing would strip internal columns.
      const body = (await res.json()) as object;
      expect(Object.keys(body).sort()).toEqual(
        Object.keys(meetingSchema.shape).sort(),
      );
      expect(meetingSchema.parse(body)).toEqual(meeting);
    });

    it("returns a not_found envelope for an unknown id", async () => {
      const res = await app.request("/api/meetings/nope");

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        error: { code: "not_found", retryable: false },
      });
    });

    it("reports stalled only once the lease is older than LEASE_MS", async () => {
      const meeting = await create();
      await deps.repo.claimLease(meeting.id, clock, 1);
      await deps.repo.update(meeting.id, { status: "transcribing" });

      tick(LEASE_MS);
      const fresh = meetingSchema.parse(
        await (await app.request(`/api/meetings/${meeting.id}`)).json(),
      );
      tick(1);
      const stale = meetingSchema.parse(
        await (await app.request(`/api/meetings/${meeting.id}`)).json(),
      );

      expect(fresh).toMatchObject({
        stalled: false,
        processingStartedAt: T0.toISOString(),
      });
      expect(stale.stalled).toBe(true);
    });
  });

  describe("POST /meetings/:id/process", () => {
    const processRequest = (id: string) =>
      app.request(`/api/meetings/${id}/process`, { method: "POST" });

    it("runs the pipeline and returns the done meeting", async () => {
      const meeting = await create();

      const res = await processRequest(meeting.id);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).not.toHaveProperty("createdIpHash");
      expect(meetingSchema.parse(body)).toMatchObject({
        id: meeting.id,
        status: "done",
        title: "Release planning",
        sttProvider: "stub:stt",
        stalled: false,
        processingStartedAt: null,
      });
    });

    it("returns a failed meeting as 200 with its error", async () => {
      vi.mocked(deps.summarize).mockRejectedValueOnce(
        new SummaryError("Summary failed", true),
      );
      const meeting = await create();

      const res = await processRequest(meeting.id);

      expect(res.status).toBe(200);
      expect(meetingSchema.parse(await res.json())).toMatchObject({
        status: "failed",
        errorStep: "summarize",
        errorMessage: "Summary failed",
        errorRetryable: true,
        attempts: 1,
      });
    });

    it("returns a not_found envelope for an unknown id", async () => {
      const res = await processRequest("nope");

      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        error: { code: "not_found", retryable: false },
      });
    });

    it("refuses a done meeting with a 422 envelope", async () => {
      const meeting = await create();
      await processRequest(meeting.id);

      const res = await processRequest(meeting.id);

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({
        error: { code: "not_processable", retryable: false },
      });
    });

    it("refuses a failure that retrying can't fix with 422", async () => {
      const meeting = await create();
      await deps.repo.update(meeting.id, {
        status: "failed",
        errorStep: "transcribe",
        errorRetryable: false,
        attempts: 1,
      });

      const res = await processRequest(meeting.id);

      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({
        error: { code: "not_retryable", retryable: false },
      });
    });

    it("refuses a meeting that is already processing with 409", async () => {
      const meeting = await create();
      await deps.repo.claimLease(meeting.id, clock, 1);

      const res = await processRequest(meeting.id);

      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: { code: "already_processing" },
      });
    });
  });

  describe("DELETE /meetings/:id", () => {
    it("deletes the row and its audio, then 404s", async () => {
      const meeting = await create();
      const deleteAudio = vi.spyOn(deps.storage, "delete");

      const res = await app.request(`/api/meetings/${meeting.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(deleteAudio).toHaveBeenCalledWith("recordings/a.webm");
      expect(await deps.repo.get(meeting.id)).toBeNull();

      const again = await app.request(`/api/meetings/${meeting.id}`, {
        method: "DELETE",
      });
      expect(again.status).toBe(404);
      expect(await again.json()).toMatchObject({
        error: { code: "not_found" },
      });
    });

    it("still deletes the meeting when audio cleanup fails", async () => {
      const log = vi.fn();
      deps = testDeps({ now: () => clock, log });
      app = createApp(deps);
      const meeting = await create();
      vi.spyOn(deps.storage, "delete").mockRejectedValue(
        new Error("blob down"),
      );

      const res = await app.request(`/api/meetings/${meeting.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
      expect(await deps.repo.get(meeting.id)).toBeNull();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: "warn", error: "blob down" }),
      );
    });
  });
});
