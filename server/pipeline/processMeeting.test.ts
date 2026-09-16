import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_AUDIO_BYTES,
} from "../../shared/constants.js";
import type { MeetingStatus } from "../../shared/schemas.js";
import type { AppDeps } from "../deps.js";
import type { MeetingPatch, NewMeeting } from "../repo/types.js";
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

const transcribed: MeetingPatch = {
  status: "transcribed",
  transcriptText: stubTranscript.text,
  transcriptSegments: stubTranscript.segments,
  language: "en",
  sttProvider: "stub:stt",
};

const summaryResult = (overrides = {}) => ({
  summary: stubSummary,
  model: "stub:llm",
  truncated: false,
  ...overrides,
});

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

  const transcribe = () => vi.mocked(deps.stt.transcribe);
  const summarize = () => vi.mocked(deps.summarize);

  describe("happy path", () => {
    it("persists and logs every step in order and resolves the done row", async () => {
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
      expect(log.mock.calls.map(([line]) => line)).toEqual([
        expect.objectContaining({
          level: "info",
          meetingId: id,
          step: "transcribe",
          durationMs: expect.any(Number),
        }),
        expect.objectContaining({
          level: "info",
          step: "summarize",
          model: "stub:llm",
        }),
      ]);
    });

    it("keeps the recorder duration STT did not measure and records truncation", async () => {
      transcribe().mockResolvedValueOnce({
        text: stubTranscript.text,
        segments: [],
      });
      summarize().mockResolvedValueOnce(summaryResult({ truncated: true }));
      const id = await seed();

      expect(await processMeeting(deps, id)).toMatchObject({
        durationSeconds: 42,
        language: null,
        transcriptTruncated: true,
      });
    });

    it("keeps a title the user typed over the LLM title", async () => {
      const id = await seed({}, { title: "Typed", titleEdited: true });

      expect((await processMeeting(deps, id)).title).toBe("Typed");
    });

    it("keeps the default title over a blank LLM title", async () => {
      summarize().mockResolvedValueOnce(
        summaryResult({ summary: { ...stubSummary, title: "  " } }),
      );
      const id = await seed();

      expect((await processMeeting(deps, id)).title).toBe(newMeeting.title);
    });
  });

  describe("resume", () => {
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
      expect(summarize()).toHaveBeenCalledExactlyOnceWith({
        text: stubTranscript.text,
        segments: stubTranscript.segments,
      });
      expect(row).toMatchObject({
        status: "done",
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
          summary: { title: "Empty recording", notes: [], actionItems: [] },
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
      expect(row).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: expect.stringContaining("25 MB"),
        errorRetryable: false,
        attempts: 1,
      });
    });

    it("fails missing audio as non-retryable", async () => {
      const id = await seed({}, { audioPathname: "recordings/gone.webm" });

      expect(await processMeeting(deps, id)).toMatchObject({
        status: "failed",
        errorStep: "transcribe",
        errorMessage: "Audio not found",
        errorRetryable: false,
      });
    });

    it("stores a known error message capped at 500 characters", async () => {
      summarize().mockRejectedValueOnce(
        new SummaryError("s".repeat(700), false),
      );
      const id = await seed();

      expect(await processMeeting(deps, id)).toMatchObject({
        errorStep: "summarize",
        errorMessage: "s".repeat(500),
        errorRetryable: false,
      });
    });

    it.each([
      [
        "transcribe",
        "Unexpected error while transcribing",
        () => vi.spyOn(storage, "readAudio"),
      ],
      ["summarize", "Unexpected error while summarizing", () => summarize()],
    ] as const)(
      "logs an unexpected %s error but never stores its message",
      async (step, errorMessage, target) => {
        target().mockRejectedValueOnce(new Error("raw provider payload"));
        const id = await seed();

        const row = await processMeeting(deps, id);

        expect(row).toMatchObject({
          status: "failed",
          errorStep: step,
          errorMessage,
          errorRetryable: true,
        });
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            level: "error",
            step,
            error: "raw provider payload",
          }),
        );
      },
    );
  });

  describe("refusals", () => {
    it("rejects an unknown id with 404", async () => {
      await expect(processMeeting(deps, "nope")).rejects.toMatchObject({
        status: 404,
        code: "not_found",
      });
    });

    it.each<[string, MeetingPatch, string]>([
      ["a done meeting", { status: "done" }, "not_processable"],
      [
        "a failure marked non-retryable",
        { status: "failed", errorRetryable: false, attempts: 1 },
        "not_retryable",
      ],
      [
        "a meeting out of attempts",
        { status: "failed", errorRetryable: true, attempts: MAX_ATTEMPTS },
        "give_up",
      ],
    ])(
      "rejects %s with 422 before taking the lease",
      async (_, patch, code) => {
        const id = await seed(patch);
        const claimLease = vi.spyOn(deps.repo, "claimLease");

        await expect(processMeeting(deps, id)).rejects.toMatchObject({
          status: 422,
          code,
        });
        expect(claimLease).not.toHaveBeenCalled();
        expect(await deps.repo.get(id)).toMatchObject(patch);
      },
    );

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
        return summaryResult();
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
  });

  describe("abandoned runs", () => {
    const abandon = async (id: string, status: MeetingStatus) => {
      await deps.repo.claimLease(id, clock, LEASE_MS);
      await deps.repo.update(id, { status });
      tick(LEASE_MS + 1);
    };

    it.each<[MeetingStatus, number]>([
      ["transcribing", 2],
      ["transcribed", 2],
      ["summarizing", 2],
      ["uploaded", 1],
    ])(
      "takes over a run abandoned while %s, first counting attempts up to %i",
      async (status, attempts) => {
        const id = await seed({ ...transcribed, attempts: 1 });
        await abandon(id, status);
        let attemptsDuringRun: number | undefined;
        summarize().mockImplementationOnce(async () => {
          attemptsDuringRun = (await deps.repo.get(id))?.attempts;
          return summaryResult();
        });

        const row = await processMeeting(deps, id);

        expect(attemptsDuringRun).toBe(attempts);
        expect(row).toMatchObject({
          status: "done",
          attempts,
          processingStartedAt: null,
        });
      },
    );

    it("counts both the abandoned run and a failed takeover, then releases the lease", async () => {
      summarize().mockRejectedValueOnce(new SummaryError("Try again", true));
      const id = await seed(transcribed);
      await abandon(id, "summarizing");

      const row = await processMeeting(deps, id);

      expect(transcribe()).not.toHaveBeenCalled();
      expect(row).toMatchObject({
        status: "failed",
        errorMessage: "Try again",
        errorRetryable: true,
        attempts: 2,
        processingStartedAt: null,
      });
    });

    it("gives up once abandoned runs use up the attempts", async () => {
      const id = await seed({ attempts: MAX_ATTEMPTS - 2 });
      await abandon(id, "transcribing");
      transcribe().mockReturnValue(new Promise(() => {}));
      for (const run of [1, 2]) {
        void processMeeting(deps, id);
        await vi.waitFor(() => expect(transcribe()).toHaveBeenCalledTimes(run));
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
