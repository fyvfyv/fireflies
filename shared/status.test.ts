import { describe, expect, it } from "vitest";
import { LEASE_MS, MAX_ATTEMPTS } from "./constants.js";
import type { MeetingStatus } from "./schemas.js";
import { canProcess, isInProgress, isStalled, nextStep } from "./status.js";

const summary = {
  title: "t",
  overview: "o",
  keyTakeaways: [],
  decisions: [],
  actionItems: [],
};

describe("nextStep", () => {
  it.each([
    ["uploaded", { transcriptText: null, summary: null }, "transcribe"],
    ["transcribed", { transcriptText: "hi", summary: null }, "summarize"],
    [
      "failed with transcript",
      { transcriptText: "hi", summary: null },
      "summarize",
    ],
    [
      "failed without transcript",
      { transcriptText: null, summary: null },
      "transcribe",
    ],
    ["transcribed silence", { transcriptText: "", summary: null }, "summarize"],
    ["done", { transcriptText: "hi", summary }, "none"],
  ] as const)("%s → %s", (_, meeting, expected) => {
    expect(nextStep(meeting)).toBe(expected);
  });
});

describe("isInProgress", () => {
  it.each([
    ["uploaded", false],
    ["transcribing", true],
    ["transcribed", true],
    ["summarizing", true],
    ["done", false],
    ["failed", false],
  ] as const)("%s → %s", (status, expected) => {
    expect(isInProgress(status)).toBe(expected);
  });
});

describe("isStalled", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it.each([
    ["transcribing", ago(LEASE_MS + 1), true],
    ["summarizing", ago(LEASE_MS + 1), true],
    ["transcribing", ago(LEASE_MS), false],
    ["summarizing", ago(1_000), false],
    ["transcribed", ago(LEASE_MS + 1), true],
    ["transcribed", ago(LEASE_MS), false],
    ["uploaded", ago(LEASE_MS + 1), true],
    ["uploaded", ago(LEASE_MS), false],
    ["uploaded", null, false],
    ["done", ago(LEASE_MS + 1), false],
    ["failed", ago(LEASE_MS + 1), false],
    ["failed", null, false],
  ] as const)(
    "%s with lease %s → %s",
    (status, processingStartedAt, expected) => {
      expect(isStalled({ status, processingStartedAt }, now)).toBe(expected);
    },
  );

  it.each(["transcribing", "transcribed", "summarizing"] as const)(
    "treats %s without a lease as stalled",
    (status) => {
      expect(isStalled({ status, processingStartedAt: null }, now)).toBe(true);
    },
  );
});

describe("canProcess", () => {
  const statuses: MeetingStatus[] = [
    "uploaded",
    "transcribing",
    "transcribed",
    "summarizing",
    "failed",
  ];

  const check = (
    status: MeetingStatus,
    attempts: number,
    errorRetryable: boolean | null = null,
  ) => canProcess({ status, attempts, errorRetryable });

  it.each(statuses)("allows %s below the attempt cap", (status) => {
    expect(check(status, MAX_ATTEMPTS - 1)).toEqual({ ok: true });
  });

  it.each(statuses)("gives up on %s at the attempt cap", (status) => {
    expect(check(status, MAX_ATTEMPTS)).toEqual({
      ok: false,
      code: "give_up",
    });
  });

  it("refuses a done meeting regardless of attempts", () => {
    expect(check("done", 0)).toEqual({ ok: false, code: "not_processable" });
    expect(check("done", MAX_ATTEMPTS)).toEqual({
      ok: false,
      code: "not_processable",
    });
  });

  it("allows a retryable failure", () => {
    expect(check("failed", 1, true)).toEqual({ ok: true });
  });

  it("refuses a failure marked non-retryable", () => {
    expect(check("failed", 1, false)).toEqual({
      ok: false,
      code: "not_retryable",
    });
  });
});
