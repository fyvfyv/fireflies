import {
  LEASE_MS,
  MAX_AUDIO_BYTES,
  MIN_TRANSCRIPT_WORDS,
} from "../../shared/constants.js";
import type {
  ErrorStep,
  MeetingStatus,
  Summary,
} from "../../shared/schemas.js";
import { canProcess, isInProgress, nextStep } from "../../shared/status.js";
import type { AppDeps } from "../deps.js";
import { HttpError, meetingNotFound } from "../http/errors.js";
import type { MeetingPatch, MeetingRepo, MeetingRow } from "../repo/types.js";
import { SttError } from "../services/stt/types.js";
import { SummaryError } from "../services/types.js";

const MAX_ERROR_MESSAGE_LENGTH = 500;

const EMPTY_SUMMARY: Summary = {
  title: "Empty recording",
  overview: "No discernible speech was found in this recording.",
  keywords: [],
  notes: [],
  keyTakeaways: [],
  decisions: [],
  actionItems: [],
};

const REFUSALS = {
  not_processable: "Meeting is already processed",
  not_retryable: "Retrying won't fix this recording, delete and re-upload it",
  give_up: "Too many failed attempts, delete and re-upload the recording",
} as const;

const GENERIC_ERRORS: Record<ErrorStep, string> = {
  transcribe: "Unexpected error while transcribing",
  summarize: "Unexpected error while summarizing",
};

// Whitespace splitting would count a whole CJK transcript as one word.
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

type StepResult = { row: MeetingRow; details: object };

/**
 * Runs the steps the meeting is still missing, under its lease, and resolves
 * with the final row (`done` or `failed`). Throws when it refuses to start, or
 * when the meeting is deleted or taken over mid-run.
 */
export async function processMeeting(
  deps: AppDeps,
  id: string,
): Promise<MeetingRow> {
  const { repo, now } = deps;
  const existing = await repo.get(id);
  if (!existing) throw meetingNotFound();
  const check = canProcess(existing);
  if (!check.ok) {
    throw new HttpError(422, check.code, REFUSALS[check.code], false);
  }
  const lease = now();
  const claimed = await repo.claimLease(id, lease, LEASE_MS);
  if (!claimed) throw alreadyProcessing();
  const run: Run = { deps, lease };

  // A run killed at the function time limit never records its failure, so the
  // takeover counts it; otherwise a stalled meeting could be retried forever.
  let row = isInProgress(claimed.status)
    ? await save(run, id, { attempts: claimed.attempts + 1 })
    : claimed;
  const { attempts } = row;
  let step: ErrorStep = "transcribe";
  let outcome: MeetingPatch = {};
  try {
    for (let next = nextStep(row); next !== "none"; next = nextStep(row)) {
      step = next;
      row = await runStep(run, row, step);
    }
  } catch (err) {
    outcome = failurePatch(err, step, attempts);
  }
  const released = await repo.releaseLease(id, lease, outcome);
  if (!released) throw await leaseLost(repo, id);
  return released;
}

// Every write of a run is guarded by the lease it took, so a run that
// outlived its lease can't clobber the run that took it over.
type Run = { deps: AppDeps; lease: Date };

export function alreadyProcessing() {
  return new HttpError(
    409,
    "already_processing",
    "Meeting is already being processed",
    false,
  );
}

// Someone else changed the meeting under us: busy if it still exists.
export async function leaseLost(repo: MeetingRepo, id: string) {
  return (await repo.get(id)) ? alreadyProcessing() : meetingNotFound();
}

async function runStep(
  run: Run,
  row: MeetingRow,
  step: ErrorStep,
): Promise<MeetingRow> {
  const { deps } = run;
  const startedAt = deps.now().getTime();
  const log = (line: object) =>
    deps.log({
      meetingId: row.id,
      step,
      durationMs: deps.now().getTime() - startedAt,
      ...line,
    });
  try {
    const result =
      step === "transcribe"
        ? await transcribe(run, row)
        : await summarize(run, row);
    log({ level: "info", msg: "pipeline step done", ...result.details });
    return result.row;
  } catch (err) {
    log({ level: "error", msg: "pipeline step failed", ...errorFields(err) });
    throw err;
  }
}

async function transcribe(run: Run, row: MeetingRow): Promise<StepResult> {
  const { deps } = run;
  await save(run, row.id, withStatus("transcribing"));
  const audio = await deps.storage.readAudio(row.audioPathname);
  if (audio.bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new SttError(
      "too_large",
      `Recording is over the ${MAX_AUDIO_BYTES / 1024 / 1024} MB speech-to-text limit`,
      false,
    );
  }
  const transcript = await deps.stt.transcribe(audio);
  const saved = await save(run, row.id, {
    ...withStatus("transcribed"),
    transcriptText: transcript.text,
    transcriptSegments: transcript.segments,
    language: transcript.language ?? null,
    sttProvider: deps.stt.name,
    // The recorder's estimate stands unless the provider measured the audio.
    ...(transcript.durationSeconds === undefined
      ? {}
      : { durationSeconds: transcript.durationSeconds }),
  });
  return {
    row: saved,
    details: { sttProvider: deps.stt.name, bytes: audio.bytes.byteLength },
  };
}

async function summarize(run: Run, row: MeetingRow): Promise<StepResult> {
  const { deps } = run;
  const text = row.transcriptText ?? "";
  // Too little speech to summarize: skip the LLM rather than let it invent content.
  if (!hasWords(text, MIN_TRANSCRIPT_WORDS)) {
    const saved = await save(run, row.id, donePatch(row, EMPTY_SUMMARY));
    return { row: saved, details: { placeholder: true } };
  }
  await save(run, row.id, withStatus("summarizing"));
  const { summary, model, truncated } = await deps.summarize({
    text,
    segments: row.transcriptSegments,
  });
  const saved = await save(run, row.id, {
    ...donePatch(row, summary),
    transcriptTruncated: truncated,
  });
  return { row: saved, details: { model, truncated } };
}

// Every status a run writes clears the previous run's error, so a row never
// shows progress next to a stale failure.
function withStatus(status: MeetingStatus): MeetingPatch {
  return { status, errorStep: null, errorMessage: null, errorRetryable: null };
}

function donePatch(row: MeetingRow, summary: Summary): MeetingPatch {
  const title = summary.title.trim();
  return {
    ...withStatus("done"),
    summary,
    ...(row.titleEdited || !title ? {} : { title }),
  };
}

async function save(
  run: Run,
  id: string,
  patch: MeetingPatch,
): Promise<MeetingRow> {
  const row = await run.deps.repo.update(id, patch, run.lease);
  if (!row) throw await leaseLost(run.deps.repo, id);
  return row;
}

export function hasWords(text: string, min: number): boolean {
  let count = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike && ++count >= min) return true;
  }
  return false;
}

// Logs keep the raw provider error that the stored message deliberately hides.
function errorFields(err: unknown) {
  if (!(err instanceof Error)) return { error: String(err) };
  const { cause } = err;
  return {
    error: err.message,
    cause: cause instanceof Error ? cause.message : cause,
  };
}

// Only our own error types carry messages written for users; anything else
// may contain provider payloads, so it is replaced with a generic string.
function failurePatch(
  err: unknown,
  step: ErrorStep,
  attempts: number,
): MeetingPatch {
  const known =
    err instanceof SttError ||
    err instanceof SummaryError ||
    err instanceof HttpError;
  return {
    status: "failed",
    errorStep: step,
    errorMessage: known
      ? err.message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
      : GENERIC_ERRORS[step],
    errorRetryable: known ? err.retryable : true,
    attempts: attempts + 1,
  };
}
