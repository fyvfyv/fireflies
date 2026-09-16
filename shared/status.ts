import { LEASE_MS, MAX_ATTEMPTS } from "./constants.js";
import type { MeetingStatus } from "./schemas.js";

type ProcessStep = "transcribe" | "summarize" | "none";

// Driven by stored artefacts, not status, so a retry never pays for speech-to-text twice.
export function nextStep(meeting: {
  transcriptText: string | null;
  summary: unknown;
}): ProcessStep {
  if (meeting.transcriptText === null) return "transcribe";
  if (meeting.summary === null) return "summarize";
  return "none";
}

// `transcribed` counts: a run passes through it between its two steps.
export function isInProgress(status: MeetingStatus): boolean {
  return (
    status === "transcribing" ||
    status === "transcribed" ||
    status === "summarizing"
  );
}

export function holdsLease(
  lease: Date | null,
  now: Date,
  leaseMs = LEASE_MS,
): boolean {
  return lease !== null && lease.getTime() >= now.getTime() - leaseMs;
}

export function isStalled(
  meeting: { status: MeetingStatus; processingStartedAt: Date | null },
  now: Date,
): boolean {
  const { status, processingStartedAt: lease } = meeting;
  if (status === "done" || status === "failed") return false;
  if (lease === null) return isInProgress(status);
  return !holdsLease(lease, now);
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
