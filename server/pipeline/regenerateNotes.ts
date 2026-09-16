import { LEASE_MS, MIN_TRANSCRIPT_WORDS } from "../../shared/constants.js";
import { holdsLease, isInProgress } from "../../shared/status.js";
import type { AppDeps } from "../deps.js";
import {
  alreadyProcessing,
  HttpError,
  meetingNotFound,
} from "../http/errors.js";
import type { MeetingRow } from "../repo/types.js";
import { hasWords, leaseLost, processMeeting } from "./processMeeting.js";

export async function regenerateNotes(
  deps: AppDeps,
  id: string,
): Promise<MeetingRow> {
  const { repo, now } = deps;
  const row = await repo.get(id);
  if (!row) throw meetingNotFound();
  // A rewrite may leave `done` before its pipeline takes the lease; that still means busy.
  if (holdsLease(row.processingStartedAt, now()) || isInProgress(row.status)) {
    throw alreadyProcessing();
  }
  const isLegacy =
    row.status === "done" &&
    !row.summary?.notes?.length &&
    hasWords(row.transcriptText ?? "", MIN_TRANSCRIPT_WORDS);
  if (!isLegacy) {
    throw new HttpError(
      422,
      "notes_current",
      "These notes are already up to date.",
      false,
    );
  }
  // Attempts reset so the original run's failures don't make the pipeline refuse the rewrite.
  const reopened = await repo.reopenLegacySummary(id, now(), LEASE_MS, {
    status: "transcribed",
    summary: null,
    attempts: 0,
  });
  if (!reopened) throw await leaseLost(repo, id);
  return processMeeting(deps, id);
}
