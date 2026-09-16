import { describe, expect, it } from "vitest";
import { LEASE_MS, MAX_ATTEMPTS } from "./constants.js";
import type { MeetingStatus } from "./schemas.js";
import { canProcess, isInProgress, isStalled, nextStep } from "./status.js";

describe("nextStep", () => {
  it.each([
    [{ transcriptText: null, summary: null }, "transcribe"],
    [{ transcriptText: "", summary: null }, "summarize"],
    [{ transcriptText: "hi", summary: {} }, "none"],
  ] as const)("%j → %s", (meeting, expected) => {
    expect(nextStep(meeting)).toBe(expected);
  });
});

describe("isInProgress", () => {
  it("holds only between a run's start and end", () => {
    const statuses: MeetingStatus[] = [
      "uploaded",
      "transcribing",
      "transcribed",
      "summarizing",
      "done",
      "failed",
    ];

    expect(statuses.filter(isInProgress)).toEqual([
      "transcribing",
      "transcribed",
      "summarizing",
    ]);
  });
});

describe("isStalled", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it.each([
    ["transcribing", ago(LEASE_MS + 1), true],
    ["transcribing", ago(LEASE_MS), false],
    ["transcribed", null, true],
    ["summarizing", null, true],
    ["uploaded", ago(LEASE_MS + 1), true],
    ["uploaded", null, false],
    ["done", ago(LEASE_MS + 1), false],
    ["failed", null, false],
  ] as const)(
    "%s with lease %s → %s",
    (status, processingStartedAt, expected) => {
      expect(isStalled({ status, processingStartedAt }, now)).toBe(expected);
    },
  );
});

describe("canProcess", () => {
  it.each([
    ["uploaded", 0, null, { ok: true }],
    ["summarizing", MAX_ATTEMPTS - 1, null, { ok: true }],
    ["failed", 1, true, { ok: true }],
    ["failed", 1, false, { ok: false, code: "not_retryable" }],
    ["failed", MAX_ATTEMPTS, true, { ok: false, code: "give_up" }],
    ["transcribing", MAX_ATTEMPTS, null, { ok: false, code: "give_up" }],
    ["done", MAX_ATTEMPTS, null, { ok: false, code: "not_processable" }],
  ] as const)(
    "%s after %i attempts (retryable: %s)",
    (status, attempts, errorRetryable, expected) => {
      expect(canProcess({ status, attempts, errorRetryable })).toEqual(
        expected,
      );
    },
  );
});
