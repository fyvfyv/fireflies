import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEASE_MS } from "../../shared/constants.js";
import {
  audioUrlSchema,
  meetingListItemSchema,
  meetingSchema,
  type StoredSummary,
} from "../../shared/schemas.js";
import { createApp } from "../app.js";
import type { AppDeps } from "../deps.js";
import type { MeetingPatch } from "../repo/types.js";
import { finalizeSummary } from "../services/summaryOutput.js";
import { SummaryError } from "../services/types.js";
import { memoryStorage } from "../storage/memoryStorage.js";
import { postJson, validCreateBody } from "../test/requests.js";
import { stubSummary, stubTranscript, testDeps } from "../test/testDeps.js";

const T0 = new Date("2026-09-16T12:00:00.000Z");

const summary: StoredSummary = {
  title: "Standup",
  overview: "o".repeat(200),
  keyTakeaways: ["a"],
  decisions: [],
  actionItems: [
    { task: "one", owner: null, due: null },
    { task: "two", owner: "Ana", due: "Friday" },
  ],
};

async function expectError(res: Response, status: number, error: object) {
  expect(res.status).toBe(status);
  expect(await res.json()).toMatchObject({ error });
}

describe("meetings routes", () => {
  let clock: Date;
  let deps: AppDeps;
  let app: ReturnType<typeof createApp>;
  const tick = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  beforeEach(() => {
    clock = T0;
    const storage = memoryStorage(() => clock);
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

  const post = (path: string) =>
    app.request(`/api/meetings/${path}`, { method: "POST" });

  describe("POST /meetings", () => {
    it("creates an uploaded meeting, giving a blank title the server default", async () => {
      const res = await postJson(app, "/api/meetings", {
        ...validCreateBody,
        title: "   ",
      });

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

    it("keeps a typed title and the recorder duration", async () => {
      const meeting = await create({
        title: "  Weekly sync  ",
        durationSeconds: 42.5,
      });

      expect(meeting).toMatchObject({
        title: "Weekly sync",
        titleEdited: true,
        durationSeconds: 42.5,
      });
    });

    it("rejects an invalid body with a validation envelope", async () => {
      const { audioPathname: _, ...body } = validCreateBody;

      await expectError(await postJson(app, "/api/meetings", body), 400, {
        code: "validation",
        message: expect.stringContaining("audioPathname"),
        retryable: false,
      });
    });
  });

  describe("GET /meetings", () => {
    it("lists newest first with the projection fields only", async () => {
      const first = await create();
      tick(1000);
      const second = await create();

      const res = await app.request("/api/meetings");

      expect(res.status).toBe(200);
      const body = (await res.json()) as object[];
      expect(Object.keys(body[0] ?? {}).sort()).toEqual(
        Object.keys(meetingListItemSchema.shape).sort(),
      );
      const items = meetingListItemSchema.array().parse(body);
      expect(items.map((item) => item.id)).toEqual([second.id, first.id]);
    });
  });

  describe("GET /meetings/:id", () => {
    it("returns exactly the public meeting fields", async () => {
      const meeting = await create({ title: "Mine" });

      const res = await app.request(`/api/meetings/${meeting.id}`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as object;
      expect(Object.keys(body).sort()).toEqual(
        Object.keys(meetingSchema.shape).sort(),
      );
      expect(meetingSchema.parse(body)).toEqual(meeting);
    });

    it("fills the fields a summary stored before notes existed lacks", async () => {
      const meeting = await create();
      await deps.repo.update(meeting.id, { status: "done", summary });

      const res = await app.request(`/api/meetings/${meeting.id}`);

      const body = (await res.json()) as { summary: unknown };
      expect(body.summary).toEqual({
        ...summary,
        keywords: [],
        notes: [],
        actionItems: [
          { task: "one", owner: null, due: null, startSecond: null },
          { task: "two", owner: "Ana", due: "Friday", startSecond: null },
        ],
      });
    });

    it("reports stalled here and in the list once the lease is older than LEASE_MS", async () => {
      const meeting = await create();
      await deps.repo.claimLease(meeting.id, clock, LEASE_MS);
      await deps.repo.update(meeting.id, { status: "transcribing" });
      const stalledFlags = async () => {
        const list = await (await app.request("/api/meetings")).json();
        const detail = await (
          await app.request(`/api/meetings/${meeting.id}`)
        ).json();
        return [
          meetingListItemSchema.array().parse(list)[0]?.stalled,
          meetingSchema.parse(detail).stalled,
        ];
      };

      tick(LEASE_MS);
      expect(await stalledFlags()).toEqual([false, false]);
      tick(1);
      expect(await stalledFlags()).toEqual([true, true]);
    });
  });

  it.each([
    ["GET", "nope"],
    ["GET", "nope/audio"],
    ["POST", "nope/process"],
    ["POST", "nope/notes"],
    ["DELETE", "nope"],
  ])(
    "answers %s /meetings/%s with a not_found envelope",
    async (method, path) => {
      const res = await app.request(`/api/meetings/${path}`, { method });

      await expectError(res, 404, { code: "not_found", retryable: false });
    },
  );

  describe("POST /meetings/:id/process", () => {
    it("runs the pipeline and returns the done meeting", async () => {
      const meeting = await create();

      const res = await post(`${meeting.id}/process`);

      expect(res.status).toBe(200);
      expect(meetingSchema.parse(await res.json())).toMatchObject({
        id: meeting.id,
        status: "done",
        title: "Release planning",
        sttProvider: "stub:stt",
        stalled: false,
        processingStartedAt: null,
      });
    });

    it("refuses a done meeting with the pipeline's error envelope", async () => {
      const meeting = await create();
      await post(`${meeting.id}/process`);
      await expectError(await post(`${meeting.id}/process`), 422, {
        code: "not_processable",
        retryable: false,
      });
    });
  });

  describe("GET /meetings/:id/audio", () => {
    const audioRequest = (id: string) =>
      app.request(`/api/meetings/${id}/audio`);

    it("returns a short-lived url that caches never keep", async () => {
      const meeting = await create();

      const res = await audioRequest(meeting.id);

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(audioUrlSchema.parse(await res.json())).toEqual({
        url: "https://memory.test/recordings/a.webm",
        expiresAt: "2026-09-16T13:00:00.000Z",
      });
    });

    it("passes on the storage error when the audio is gone", async () => {
      const meeting = await create({ audioPathname: "recordings/gone.webm" });
      await expectError(await audioRequest(meeting.id), 404, {
        code: "audio_missing",
        retryable: false,
      });
    });
  });

  describe("POST /meetings/:id/notes", () => {
    const notesRequest = (id: string) => post(`${id}/notes`);

    const seedLegacy = async (patch: MeetingPatch = {}) => {
      const meeting = await create();
      await deps.repo.update(meeting.id, {
        status: "done",
        title: "Standup",
        transcriptText: stubTranscript.text,
        transcriptSegments: stubTranscript.segments,
        summary,
        ...patch,
      });
      return meeting.id;
    };

    const expectNotesCurrent = (res: Response) =>
      expectError(res, 422, {
        code: "notes_current",
        message: "These notes are already up to date.",
        retryable: false,
      });

    it.each<[string, MeetingPatch]>([
      ["no notes", {}],
      ["an empty notes list", { summary: { ...summary, notes: [] } }],
      ["exhausted attempts", { attempts: 5 }],
    ])(
      "rewrites a legacy summary with %s and returns the done meeting",
      async (_, patch) => {
        const id = await seedLegacy(patch);

        const res = await notesRequest(id);

        expect(res.status).toBe(200);
        expect(meetingSchema.parse(await res.json())).toMatchObject({
          id,
          status: "done",
          summary: stubSummary,
          title: "Release planning",
          errorStep: null,
          processingStartedAt: null,
        });
        expect(deps.summarize).toHaveBeenCalledExactlyOnceWith({
          text: stubTranscript.text,
          segments: stubTranscript.segments,
        });
        expect(deps.stt.transcribe).not.toHaveBeenCalled();
      },
    );

    it("returns a failed rewrite as 200 and lets it retry the summary", async () => {
      vi.mocked(deps.summarize).mockRejectedValueOnce(
        new SummaryError("Summary failed", true),
      );
      const id = await seedLegacy();

      const res = await notesRequest(id);

      expect(res.status).toBe(200);
      expect(meetingSchema.parse(await res.json())).toMatchObject({
        status: "failed",
        errorStep: "summarize",
        errorMessage: "Summary failed",
        errorRetryable: true,
        summary: null,
        transcriptText: stubTranscript.text,
      });
      const retry = await post(`${id}/process`);
      expect(meetingSchema.parse(await retry.json())).toMatchObject({
        status: "done",
        summary: stubSummary,
      });
    });

    it.each<[string, MeetingPatch]>([
      ["a meeting that is not done", { status: "failed", summary: null }],
      ["a missing transcript", { transcriptText: null }],
      ["a transcript with too few words", { transcriptText: "one two" }],
      ["a summary that already has notes", { summary: stubSummary }],
    ])("refuses %s with notes_current", async (_, patch) => {
      const id = await seedLegacy(patch);
      const before = await deps.repo.get(id);

      await expectNotesCurrent(await notesRequest(id));
      expect(deps.summarize).not.toHaveBeenCalled();
      expect(await deps.repo.get(id)).toEqual(before);
    });

    it("leaves notes alone that were saved after the call read the meeting", async () => {
      const id = await seedLegacy();
      const stale = await deps.repo.get(id);
      await deps.repo.update(id, { summary: stubSummary });
      vi.spyOn(deps.repo, "get").mockResolvedValueOnce(stale);

      expect((await notesRequest(id)).status).toBe(409);
      expect(deps.summarize).not.toHaveBeenCalled();
      expect(await deps.repo.get(id)).toMatchObject({
        status: "done",
        summary: stubSummary,
      });
    });

    it("keeps notes current after a rewrite whose answer had no sections", async () => {
      vi.mocked(deps.summarize).mockImplementationOnce(
        async ({ segments }) => ({
          summary: finalizeSummary({ ...stubSummary, notes: [] }, segments),
          model: "stub:llm",
          truncated: false,
        }),
      );
      const id = await seedLegacy();

      const first = await notesRequest(id);
      expect(meetingSchema.parse(await first.json()).summary?.notes).toEqual([
        expect.objectContaining({ heading: "Release planning" }),
      ]);

      await expectNotesCurrent(await notesRequest(id));
      expect(deps.summarize).toHaveBeenCalledOnce();
    });

    it.each<[string, MeetingPatch]>([
      ["is about to start", { status: "transcribed", summary: null }],
      [
        "retry holds a fresh lease",
        { status: "failed", summary: null, processingStartedAt: T0 },
      ],
    ])("refuses with 409 while a rewrite %s", async (_, patch) => {
      const id = await seedLegacy(patch);
      const before = await deps.repo.get(id);

      await expectError(await notesRequest(id), 409, {
        code: "already_processing",
        retryable: false,
      });
      expect(deps.summarize).not.toHaveBeenCalled();
      expect(await deps.repo.get(id)).toEqual(before);
    });

    it("answers a concurrent second call with 409", async () => {
      const id = await seedLegacy();

      const responses = await Promise.all([notesRequest(id), notesRequest(id)]);

      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(deps.summarize).toHaveBeenCalledOnce();
      expect(await deps.repo.get(id)).toMatchObject({
        status: "done",
        summary: stubSummary,
        processingStartedAt: null,
      });
    });
  });

  describe("DELETE /meetings/:id", () => {
    const deleteRequest = (id: string) =>
      app.request(`/api/meetings/${id}`, { method: "DELETE" });

    it("deletes the row and its audio, then 404s", async () => {
      const meeting = await create();
      const deleteAudio = vi.spyOn(deps.storage, "delete");

      const res = await deleteRequest(meeting.id);

      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
      expect(deleteAudio).toHaveBeenCalledWith("recordings/a.webm");
      expect(await deps.repo.get(meeting.id)).toBeNull();
      await expectError(await deleteRequest(meeting.id), 404, {
        code: "not_found",
      });
    });

    it("still deletes the meeting when audio cleanup fails", async () => {
      const log = vi.fn();
      app = createApp({ ...deps, log });
      const meeting = await create();
      vi.spyOn(deps.storage, "delete").mockRejectedValue(
        new Error("blob down"),
      );

      expect((await deleteRequest(meeting.id)).status).toBe(204);
      expect(await deps.repo.get(meeting.id)).toBeNull();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: "warn", error: "blob down" }),
      );
    });
  });
});
