import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_AUDIO_BYTES,
} from "../../shared/constants.js";
import type { MeetingStatus } from "../../shared/schemas.js";
import type { AppDeps } from "../deps.js";
import { HttpError } from "../http/errors.js";
import type { MeetingPatch, NewMeeting } from "../repo/types.js";
import { SttError } from "../services/stt/types.js";
import { SummaryError } from "../services/types.js";
import { type MemoryStorage, memoryStorage } from "../storage/memoryStorage.js";
import { stubSummary, stubTranscript, testDeps } from "../test/testDeps.js";
import { processMeeting } from "./processMeeting.js";

const T0 = new Date("2026-09-16T12:00:00.000Z");
const AUDIO = "recordings/a.webm";

const newMeeting: NewMeeting = {
  title: "Recording 2026-09-16 12:00 UTC",
  titleEdited: false,
  source: "mic",
  audioPathname: AUDIO,
  contentType: "audio/webm",
  sizeBytes: 3,
  durationSeconds: 42,
  createdIpHash: null,
};

describe("processMeeting", () => {
  let clock: Date;
  let storage: MemoryStorage;
  let log: Mock<AppDeps["log"]>;
  let deps: AppDeps;
  const tick = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  beforeEach(() => {
    clock = T0;
    storage = memoryStorage();
    storage.put(AUDIO, {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "audio/webm",
    });
    log = vi.fn();
    deps = testDeps({ now: () => clock, storage, log });
  });

  const seed = async (
    patch: MeetingPatch = {},
    meeting: Partial<NewMeeting> = {},
  ) => {
    const row = await deps.repo.create({ ...newMeeting, ...meeting });
    await deps.repo.update(row.id, patch);
    return row.id;
  };

  const transcribed: MeetingPatch = {
    status: "transcribed",
    transcriptText: stubTranscript.text,
    transcriptSegments: stubTranscript.segments,
    language: "en",
    sttProvider: "stub:stt",
  };

  const transcribe = () => vi.mocked(deps.stt.transcribe);
  const summarize = () => vi.mocked(deps.summarize);

  describe("happy path", () => {
    it("persists every step in order and resolves the done row", async () => {
      const id = await seed();
      const update = vi.spyOn(deps.repo, "update");

      const row = await processMeeting(deps, id);

      expect(update.mock.calls.map(([, patch]) => patch.status)).toEqual([
        "transcribing",
        "transcribed",
        "summarizing",
        "done",
      ]);
      expect(transcribe()).toHaveBeenCalledWith({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "audio/webm",
      });
      expect(summarize()).toHaveBeenCalledWith({
        text: stubTranscript.text,
        segments: stubTranscript.segments,
      });
      expect(row).toMatchObject({
        status: "done",
        title: stubSummary.title,
        transcriptText: stubTranscript.text,
        transcriptSegments: stubTranscript.segments,
        language: "en",
        durationSeconds: 5.2,
        sttProvider: "stub:stt",
        summary: stubSummary,
        transcriptTruncated: false,
        attempts: 0,
        errorStep: null,
        processingStartedAt: null,
      });
      expect(await deps.repo.get(id)).toEqual(row);
    });

    it("keeps the recorder duration when STT does not report one", async () => {
      transcribe().mockResolvedValueOnce({
        text: stubTranscript.text,
        segments: [],
      });
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({ durationSeconds: 42, language: null });
    });

    it("records a truncated prompt", async () => {
      summarize().mockResolvedValueOnce({
        summary: stubSummary,
        model: "stub:llm",
        truncated: true,
      });
      const id = await seed();

      expect((await processMeeting(deps, id)).transcriptTruncated).toBe(true);
    });

    it("keeps a title the user typed", async () => {
      const id = await seed({}, { title: "Weekly sync", titleEdited: true });

      expect((await processMeeting(deps, id)).title).toBe("Weekly sync");
    });

    it("keeps the default title when the LLM returns a blank one", async () => {
      summarize().mockResolvedValueOnce({
        summary: { ...stubSummary, title: "  " },
        model: "stub:llm",
        truncated: false,
      });
      const id = await seed();

      expect((await processMeeting(deps, id)).title).toBe(newMeeting.title);
    });

    it("logs one line per step with its duration", async () => {
      const id = await seed();

      await processMeeting(deps, id);

      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "info",
          meetingId: id,
          step: "transcribe",
          durationMs: expect.any(Number),
        }),
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          step: "summarize",
          model: "stub:llm",
          durationMs: expect.any(Number),
        }),
      );
    });
  });

  describe("resume", () => {
    it("skips speech-to-text when the transcript is already stored", async () => {
      const id = await seed(transcribed);

      const row = await processMeeting(deps, id);

      expect(transcribe()).not.toHaveBeenCalled();
      expect(summarize()).toHaveBeenCalledExactlyOnceWith({
        text: stubTranscript.text,
        segments: stubTranscript.segments,
      });
      expect(row.status).toBe("done");
    });

    it("summarizes a stored transcript without segments as plain text", async () => {
      const id = await seed({ ...transcribed, transcriptSegments: null });

      await processMeeting(deps, id);

      expect(summarize()).toHaveBeenCalledExactlyOnceWith({
        text: stubTranscript.text,
        segments: null,
      });
    });

    it("retries only the summary after a failed summarize", async () => {
      const id = await seed({
        ...transcribed,
        status: "failed",
        errorStep: "summarize",
        errorMessage: "Summary failed",
        errorRetryable: true,
        attempts: 1,
      });

      const row = await processMeeting(deps, id);

      expect(transcribe()).not.toHaveBeenCalled();
      expect(row).toMatchObject({
        status: "done",
        transcriptText: stubTranscript.text,
        summary: stubSummary,
        errorStep: null,
        errorMessage: null,
        errorRetryable: null,
        attempts: 1,
      });
    });

    it.each([
      ["empty", ""],
      ["four-word", "one two three four"],
    ])(
      "finishes a %s transcript with a placeholder summary and no LLM call",
      async (_, text) => {
        transcribe().mockResolvedValueOnce({ text, segments: [] });
        const id = await seed();

        const row = await processMeeting(deps, id);

        expect(summarize()).not.toHaveBeenCalled();
        expect(row).toMatchObject({
          status: "done",
          transcriptText: text,
          title: "Empty recording",
          summary: {
            title: "Empty recording",
            keywords: [],
            notes: [],
            keyTakeaways: [],
            decisions: [],
            actionItems: [],
          },
        });
      },
    );

    it("counts words in scripts without spaces", async () => {
      const text = "我们决定周五发布新版本并且安娜负责写会议记录";
      transcribe().mockResolvedValueOnce({ text, segments: [] });
      const id = await seed();

      await processMeeting(deps, id);

      expect(summarize()).toHaveBeenCalledWith({ text, segments: [] });
    });
  });

  describe("failures", () => {
    it("fails oversized audio as non-retryable without calling STT", async () => {
      storage.put(AUDIO, {
        bytes: new Uint8Array(MAX_AUDIO_BYTES + 1),
        contentType: "audio/webm",
      });
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(transcribe()).not.toHaveBeenCalled();
      expect(summarize()).not.toHaveBeenCalled();
      expect(row).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: expect.stringContaining("25 MB"),
        errorRetryable: false,
        attempts: 1,
      });
    });

    it("stores the STT error message and retryability", async () => {
      transcribe().mockRejectedValueOnce(
        new SttError("provider", "Speech-to-text provider failed", true),
      );
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: "Speech-to-text provider failed",
        errorRetryable: true,
        transcriptText: null,
      });
    });

    it("treats an unexpected storage error as a retryable transcribe failure", async () => {
      vi.spyOn(storage, "readAudio").mockRejectedValueOnce(
        new Error("socket hang up"),
      );
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: "Unexpected error while transcribing",
        errorRetryable: true,
      });
    });

    it("fails missing audio as non-retryable", async () => {
      const id = await seed({}, { audioPathname: "recordings/gone.webm" });

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: "Audio not found",
        errorRetryable: false,
      });
    });

    it("never stores a raw unexpected error message", async () => {
      summarize().mockRejectedValueOnce(new Error("k".repeat(700)));
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({
        status: "failed",
        errorStep: "summarize",
        errorMessage: "Unexpected error while summarizing",
        errorRetryable: true,
        transcriptText: stubTranscript.text,
        summary: null,
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          level: "error",
          step: "summarize",
          error: "k".repeat(700),
        }),
      );
    });

    it("caps a known error message at 500 characters", async () => {
      summarize().mockRejectedValueOnce(
        new SummaryError("s".repeat(700), false),
      );
      const id = await seed();

      const row = await processMeeting(deps, id);

      expect(row.errorMessage).toBe("s".repeat(500));
      expect(row.errorRetryable).toBe(false);
    });

    it("counts the fifth failed attempt and releases the lease", async () => {
      summarize().mockRejectedValueOnce(new SummaryError("nope", true));
      const id = await seed({ ...transcribed, status: "failed", attempts: 4 });

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({
        status: "failed",
        attempts: 5,
        processingStartedAt: null,
      });
    });
  });

  describe("refusals", () => {
    it("rejects an unknown id with 404", async () => {
      await expect(processMeeting(deps, "nope")).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("rejects a done meeting with 422 before taking the lease", async () => {
      const id = await seed({ status: "done" });
      const claimLease = vi.spyOn(deps.repo, "claimLease");

      const err = await processMeeting(deps, id).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ status: 422, code: "not_processable" });
      expect(claimLease).not.toHaveBeenCalled();
    });

    it("rejects a failure marked non-retryable before taking the lease", async () => {
      const id = await seed({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: "Audio not found",
        errorRetryable: false,
        attempts: 1,
      });
      const claimLease = vi.spyOn(deps.repo, "claimLease");

      await expect(processMeeting(deps, id)).rejects.toMatchObject({
        status: 422,
        code: "not_retryable",
      });
      expect(claimLease).not.toHaveBeenCalled();
      expect(transcribe()).not.toHaveBeenCalled();
    });

    it("gives up after five failed attempts without calling STT", async () => {
      const id = await seed({ status: "failed", attempts: 5 });

      await expect(processMeeting(deps, id)).rejects.toMatchObject({
        status: 422,
        code: "give_up",
      });
      expect(transcribe()).not.toHaveBeenCalled();
      expect((await deps.repo.get(id))?.attempts).toBe(5);
    });

    it("rejects with 409 while another run holds a fresh lease", async () => {
      const id = await seed();
      await deps.repo.claimLease(id, clock, 1);
      tick(60_000);

      await expect(processMeeting(deps, id)).rejects.toMatchObject({
        status: 409,
        code: "already_processing",
      });
      expect(transcribe()).not.toHaveBeenCalled();
    });

    it("rejects with 404 when the meeting is deleted mid-run", async () => {
      const id = await seed();
      summarize().mockImplementationOnce(async () => {
        await deps.repo.delete(id);
        return { summary: stubSummary, model: "stub:llm", truncated: false };
      });

      await expect(processMeeting(deps, id)).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it("rejects with 409 and writes nothing once its run is taken over", async () => {
      const id = await seed();
      const takeover = new Date(T0.getTime() + LEASE_MS + 1);
      transcribe().mockImplementationOnce(async () => {
        await deps.repo.claimLease(id, takeover, LEASE_MS);
        return stubTranscript;
      });

      await expect(processMeeting(deps, id)).rejects.toMatchObject({
        status: 409,
        code: "already_processing",
      });
      expect(await deps.repo.get(id)).toMatchObject({
        status: "transcribing",
        transcriptText: null,
        errorStep: null,
        attempts: 0,
        processingStartedAt: takeover,
      });
      expect(summarize()).not.toHaveBeenCalled();
    });

    it("takes over a stale lease", async () => {
      const id = await seed();
      await deps.repo.claimLease(id, clock, 1);
      await deps.repo.update(id, { status: "transcribing" });
      tick(LEASE_MS + 1);

      const row = await processMeeting(deps, id);

      expect(row).toMatchObject({ status: "done", processingStartedAt: null });
    });

    describe("abandoned runs", () => {
      const abandon = async (id: string, status: MeetingStatus) => {
        await deps.repo.claimLease(id, clock, LEASE_MS);
        await deps.repo.update(id, { status });
        tick(LEASE_MS + 1);
      };

      it("counts the abandoned run before redoing its work", async () => {
        const id = await seed({ attempts: 1 });
        await abandon(id, "transcribing");
        let attemptsDuringRun: number | undefined;
        transcribe().mockImplementationOnce(async () => {
          attemptsDuringRun = (await deps.repo.get(id))?.attempts;
          return stubTranscript;
        });

        const row = await processMeeting(deps, id);

        expect(attemptsDuringRun).toBe(2);
        expect(row).toMatchObject({ status: "done", attempts: 2 });
      });

      it("counts a run abandoned between its two steps", async () => {
        const id = await seed({ ...transcribed, attempts: 1 });
        await abandon(id, "transcribed");

        const row = await processMeeting(deps, id);

        expect(row).toMatchObject({ status: "done", attempts: 2 });
        expect(transcribe()).not.toHaveBeenCalled();
      });

      it("does not count a lease taken before any work started", async () => {
        const id = await seed({ attempts: 1 });
        await abandon(id, "uploaded");

        const row = await processMeeting(deps, id);

        expect(row).toMatchObject({ status: "done", attempts: 1 });
      });

      it("counts both the abandoned run and a failed takeover", async () => {
        summarize().mockRejectedValueOnce(new SummaryError("nope", true));
        const id = await seed(transcribed);
        await abandon(id, "summarizing");

        const row = await processMeeting(deps, id);

        expect(row).toMatchObject({ status: "failed", attempts: 2 });
        expect(transcribe()).not.toHaveBeenCalled();
      });

      it("gives up once abandoned runs use up the attempts", async () => {
        const id = await seed({ attempts: MAX_ATTEMPTS - 2 });
        await abandon(id, "transcribing");
        // A killed function never settles, so its lease is never released.
        transcribe().mockReturnValue(new Promise(() => {}));
        for (const run of [1, 2]) {
          void processMeeting(deps, id);
          await vi.waitFor(() =>
            expect(transcribe()).toHaveBeenCalledTimes(run),
          );
          tick(LEASE_MS + 1);
        }

        await expect(processMeeting(deps, id)).rejects.toMatchObject({
          status: 422,
          code: "give_up",
        });
        expect((await deps.repo.get(id))?.attempts).toBe(MAX_ATTEMPTS);
      });
    });
  });
});
