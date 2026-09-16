import type { ErrorStep, Meeting, MeetingStatus } from "@shared/schemas";
import { tw } from "@tw";

export type StepperMeeting = Pick<Meeting, "status" | "errorStep" | "stalled">;

type StepState = "pending" | "active" | "done" | "error" | "stalled";

const STEPS = ["Uploaded", "Transcribing", "Summarizing", "Done"] as const;

// Index of the step each status is working on; `uploaded` already counts as
// transcribing because the page starts the pipeline right away.
const CURRENT_STEP: Record<Exclude<MeetingStatus, "failed">, number> = {
  uploaded: 1,
  transcribing: 1,
  transcribed: 2,
  summarizing: 2,
  done: 4,
};

const FAILED_STEP: Record<ErrorStep, number> = { transcribe: 1, summarize: 2 };

function steps({ status, errorStep, stalled }: StepperMeeting) {
  const current =
    status === "failed"
      ? FAILED_STEP[errorStep ?? "transcribe"]
      : CURRENT_STEP[status];
  const problem: StepState | null =
    status === "failed" ? "error" : stalled ? "stalled" : null;
  return STEPS.map((label, index) => {
    let state: StepState = problem ?? "active";
    if (index < current) state = "done";
    if (index > current) state = "pending";
    return { label, state };
  });
}

function progressMessage({ status, errorStep, stalled }: StepperMeeting) {
  if (status === "failed") {
    return errorStep === "summarize"
      ? "Summary failed"
      : "Transcription failed";
  }
  if (stalled) return "Processing was interrupted";
  switch (status) {
    case "uploaded":
      return "Starting…";
    case "transcribing":
      return "Transcribing the audio…";
    case "transcribed":
    case "summarizing":
      return "Writing the summary…";
    case "done":
      return "Summary ready";
  }
}

const stateText: Record<StepState, string> = {
  pending: "not started",
  active: "in progress",
  done: "completed",
  error: "failed",
  stalled: "interrupted",
};

// Glyphs come from CSS so they stay out of the steps' text content.
const markers: Record<StepState, string> = {
  pending: "border border-neutral-300 bg-white",
  active: "animate-pulse bg-sky-500",
  done: "bg-emerald-600 text-white after:content-['✓']",
  error: "bg-red-600 text-white after:content-['!']",
  stalled: "bg-amber-500 text-white after:content-['‖']",
};

export function StatusStepper({ meeting }: { meeting: StepperMeeting }) {
  return (
    <div className={tw("space-y-2")}>
      <ol
        aria-label="Processing steps"
        className={tw("flex flex-wrap items-center gap-x-4 gap-y-2")}
      >
        {steps(meeting).map(({ label, state }) => (
          <li
            key={label}
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
            className={tw(
              "flex items-center gap-2 text-body",
              state === "pending" ? "text-neutral-500" : "text-neutral-900",
            )}
          >
            <span
              aria-hidden
              className={tw(
                "flex size-5 items-center justify-center rounded-full text-caption font-semibold",
                markers[state],
              )}
            />
            <span className={tw(state === "active" && "font-medium")}>
              {label}
            </span>
            <span className={tw("sr-only")}> ({stateText[state]})</span>
          </li>
        ))}
      </ol>
      <p role="status" className={tw("text-body text-neutral-600")}>
        {progressMessage(meeting)}
      </p>
    </div>
  );
}
