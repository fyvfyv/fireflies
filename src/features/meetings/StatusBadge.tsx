import type { MeetingStatus } from "@shared/schemas";
import { tw } from "@tw";
import { CircleAlert, CircleCheck, CirclePause } from "lucide-react";

// `transcribed` sits between the two steps of a run that is about to write
// the notes; `uploaded` waits for someone to open the meeting. "Notes" is the
// word the meeting page uses for the result.
const progressLabels: Record<
  Exclude<MeetingStatus, "done" | "failed">,
  string
> = {
  uploaded: "Waiting",
  transcribing: "Transcribing",
  transcribed: "Writing notes",
  summarizing: "Writing notes",
};

const base = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap";

type StatusBadgeProps = {
  status: MeetingStatus;
  stalled: boolean;
  className?: string;
};

export function StatusBadge({ status, stalled, className }: StatusBadgeProps) {
  if (stalled) {
    return (
      <span className={tw(base, "text-graphite", className)}>
        <CirclePause aria-hidden="true" size={16} />
        <span>Interrupted</span>
      </span>
    );
  }
  switch (status) {
    case "done":
      // Done is the normal case, so it stays quiet: a check, named for
      // screen readers only.
      return (
        <span className={tw(base, className)}>
          <CircleCheck aria-hidden="true" size={16} className={tw("text-ok")} />
          <span className={tw("sr-only")}>Done</span>
        </span>
      );
    case "failed":
      return (
        <span className={tw(base, "font-medium text-danger", className)}>
          <CircleAlert aria-hidden="true" size={16} />
          <span>Failed</span>
        </span>
      );
    default:
      return (
        <span className={tw(base, "text-graphite", className)}>
          <ProgressDots />
          <span>{progressLabels[status]}</span>
        </span>
      );
  }
}

const DOT_DELAYS = ["0ms", "160ms", "320ms"];

function ProgressDots() {
  return (
    <span
      aria-hidden="true"
      className={tw("inline-flex w-4 items-center justify-center gap-0.5")}
    >
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          data-slot="progress-dot"
          // The rec-pulse token stops under reduced motion like every
          // animate-* utility; the label still says what is happening.
          className={tw("size-1 animate-rec-pulse rounded-full bg-current")}
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}
