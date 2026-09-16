import { LEASE_MS, MIN_TRANSCRIPT_WORDS } from "../../shared/constants.js";
import { isInProgress } from "../../shared/status.js";
import type { AppDeps } from "../deps.js";
import { HttpError, meetingNotFound } from "../http/errors.js";
import type { MeetingRow } from "../repo/types.js";
import {
  alreadyProcessing,
  hasWords,
  leaseLost,
  processMeeting,
} from "./processMeeting.js";

const notesCurrent = () =>
  new HttpError(
    422,
    "notes_current",
    "These notes are already up to date.",
    false,
  );

function holdsLease(row: MeetingRow, now: Date): boolean {
  const lease = row.processingStartedAt;
  return lease !== null && lease.getTime() >= now.getTime() - LEASE_MS;
}

// Only summaries written before notes existed qualify, which also keeps a
// meeting from being sent back to the LLM over and over.
function canRegenerate(row: MeetingRow): boolean {
  return (
    row.status === "done" &&
    hasWords(row.transcriptText ?? "", MIN_TRANSCRIPT_WORDS) &&
    !row.summary?.notes?.length
  );
}

/**
 * Replaces a legacy summary with one that has notes by clearing it and running
 * the pipeline, which then redoes only the summarize step. Resolves with the
 * final row (`done`, or `failed` for the usual retry flow).
 */
export async function regenerateNotes(
  deps: AppDeps,
  id: string,
): Promise<MeetingRow> {
  const { repo, now } = deps;
  const row = await repo.get(id);
  if (!row) throw meetingNotFound();
  // A rewrite already running has moved the row out of `done`, possibly
  // before the pipeline took its lease; its caller should hear "busy" rather
  // than "up to date".
  if (holdsLease(row, now()) || isInProgress(row.status)) {
    throw alreadyProcessing();
  }
  if (!canRegenerate(row)) throw notesCurrent();
  // Conditional, so a concurrent call that got here first (or whose rewrite
  // already finished) wins and this one reports busy.
  const reopened = await repo.reopenLegacySummary(id, now(), LEASE_MS, {
    status: "transcribed",
    summary: null,
    // A new job: failures from the original run must not make the pipeline
    // refuse right after the old summary was cleared.
    attempts: 0,
  });
  if (!reopened) throw await leaseLost(repo, id);
  return processMeeting(deps, id);
}
