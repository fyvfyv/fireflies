import type { ErrorStep, Meeting, MeetingStatus } from "@shared/schemas";
import { tw } from "@tw";
import { Check, Pause, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ClockDigits } from "@/components/ui/ClockDigits";
import { formatShortTime } from "@/lib/time";

export type StepperMeeting = Pick<Meeting, "status" | "errorStep" | "stalled">;

type StepState = "pending" | "active" | "done" | "error" | "stalled";

const STEPS = ["Upload", "Transcript", "Notes", "Done"] as const;

// `uploaded` counts as transcribing: the page starts the pipeline right away.
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

function progress({ status, errorStep, stalled }: StepperMeeting): {
  message: string;
  detail?: string;
} {
  if (status === "failed") {
    return {
      message:
        errorStep === "summarize" ? "Notes failed" : "Transcription failed",
    };
  }
  if (stalled) return { message: "Processing was interrupted" };
  switch (status) {
    case "uploaded":
      return {
        message: "Starting…",
        detail: "The recording is uploaded. Transcription starts in a moment.",
      };
    case "transcribing":
      return {
        message: "Transcribing the recording…",
        detail: "Longer recordings take up to a minute.",
      };
    case "transcribed":
    case "summarizing":
      return {
        message: "Writing the notes…",
        detail: "The transcript is ready to read while you wait.",
      };
    case "done":
      return { message: "Notes ready" };
  }
}

const stateText: Record<StepState, string> = {
  pending: "not started",
  active: "in progress",
  done: "completed",
  error: "failed",
  stalled: "interrupted",
};

type StatusStepperProps = {
  meeting: StepperMeeting;
  since?: string | null;
  className?: string;
};

export function StatusStepper({
  meeting,
  since = null,
  className,
}: StatusStepperProps) {
  const { message, detail } = progress(meeting);
  const problem = meeting.status === "failed" || meeting.stalled;
  const running = meeting.status !== "done" && !problem;
  const list = steps(meeting);

  return (
    <div className={tw("flex flex-col gap-5", className)}>
      <ol
        aria-label="Processing steps"
        className={tw(
          "grid grid-cols-[repeat(4,minmax(max-content,1fr))] gap-x-2",
        )}
      >
        {list.map(({ label, state }, index) => (
          <li
            key={label}
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
            className={tw("flex min-w-0 flex-col gap-2")}
          >
            <span className={tw("flex items-center gap-2")}>
              <StepMarker state={state} />
              {index < list.length - 1 && (
                <span
                  aria-hidden="true"
                  className={tw(
                    "h-px min-w-2 flex-1 rounded-full transition-colors duration-300",
                    state === "done" ? "bg-ink" : "bg-rule",
                  )}
                />
              )}
            </span>
            <span
              className={tw(
                "type-small whitespace-nowrap",
                state === "pending" ? "text-graphite" : "text-ink",
                state === "active" && "font-semibold",
              )}
            >
              {label}
              <span className={tw("sr-only")}> ({stateText[state]})</span>
            </span>
          </li>
        ))}
      </ol>
      <div
        // sr-only rather than unmounted, so the failure is still announced.
        className={tw("space-y-0.5", problem && "sr-only")}
      >
        <div className={tw("flex flex-wrap items-baseline gap-x-3")}>
          <p role="status" className={tw("type-body font-medium text-ink")}>
            {message}
          </p>
          {running && since && <Elapsed since={since} />}
        </div>
        {detail && <p className={tw("type-small text-graphite")}>{detail}</p>}
      </div>
    </div>
  );
}

function StepMarker({ state }: { state: StepState }) {
  const base =
    "relative grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300";
  switch (state) {
    case "pending":
      return (
        <span
          aria-hidden="true"
          className={tw(base, "border border-rule bg-sheet")}
        />
      );
    case "active":
      return (
        <span aria-hidden="true" className={tw(base, "border-2 border-rule")}>
          <span
            className={tw(
              "absolute -inset-0.5 animate-spin rounded-full border-2 border-transparent border-t-ink",
            )}
          />
          <span className={tw("size-1.5 rounded-full bg-ink")} />
        </span>
      );
    case "done":
      return (
        <span aria-hidden="true" className={tw(base, "bg-ok text-sheet")}>
          <Check size={14} strokeWidth={2.5} />
        </span>
      );
    case "error":
      return (
        <span aria-hidden="true" className={tw(base, "bg-danger text-sheet")}>
          <X size={14} strokeWidth={2.5} />
        </span>
      );
    case "stalled":
      return (
        <span aria-hidden="true" className={tw(base, "bg-graphite text-sheet")}>
          <Pause size={12} strokeWidth={2.5} fill="currentColor" />
        </span>
      );
  }
}

// Outside the status region so screen readers aren't told every second.
function Elapsed({ since }: { since: string }) {
  const started = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className={tw("flex items-center gap-1.5 type-small text-graphite")}>
      <Timer aria-hidden="true" size={14} />
      <span className={tw("sr-only")}>Elapsed</span>
      <ClockDigits
        className={tw("self-baseline")}
        value={formatShortTime((now - started) / 1_000)}
      />
    </p>
  );
}
