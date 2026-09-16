import { LEASE_MS, MAX_ATTEMPTS } from "./constants.js";
import type { MeetingStatus } from "./schemas.js";

type ProcessStep = "transcribe" | "summarize" | "none";

// Driven by persisted artefacts rather than status, so a retry after a failed
// summary resumes at summarize and never pays for speech-to-text twice.
export function nextStep(meeting: {
  transcriptText: string | null;
  summary: unknown;
}): ProcessStep {
  if (meeting.transcriptText === null) return "transcribe";
  if (meeting.summary === null) return "summarize";
  return "none";
}

// A run has started and not yet ended. `transcribed` counts: a run passes
// through it between its two steps.
export function isInProgress(status: MeetingStatus): boolean {
  return (
    status === "transcribing" ||
    status === "transcribed" ||
    status === "summarizing"
  );
}

export function isStalled(
  meeting: { status: MeetingStatus; processingStartedAt: Date | null },
  now: Date,
): boolean {
  const { status, processingStartedAt: lease } = meeting;
  if (status === "done" || status === "failed") return false;
  // A started run without a lease can only have been interrupted; an
  // `uploaded` row without one just hasn't been picked up yet.
  if (lease === null) return isInProgress(status);
  // Covers `uploaded` too: a run killed right after taking the lease.
  return lease.getTime() < now.getTime() - LEASE_MS;
}

type ProcessCheck =
  | { ok: true }
  | { ok: false; code: "not_processable" | "not_retryable" | "give_up" };

export function canProcess(meeting: {
  status: MeetingStatus;
  attempts: number;
  errorRetryable: boolean | null;
}): ProcessCheck {
  if (meeting.status === "done") return { ok: false, code: "not_processable" };
  if (meeting.status === "failed" && meeting.errorRetryable === false) {
    return { ok: false, code: "not_retryable" };
  }
  if (meeting.attempts >= MAX_ATTEMPTS) return { ok: false, code: "give_up" };
  return { ok: true };
}
