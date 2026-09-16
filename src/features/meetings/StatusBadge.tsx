import type { MeetingStatus } from "@shared/schemas";
import { tw } from "@tw";
import { CircleAlert, CircleCheck, CirclePause } from "lucide-react";

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

export function StatusBadge({
  status,
  stalled,
}: {
  status: MeetingStatus;
  stalled: boolean;
}) {
  if (stalled) {
    return (
      <span className={tw(base, "text-graphite")}>
        <CirclePause aria-hidden="true" size={16} />
        <span>Interrupted</span>
      </span>
    );
  }
  switch (status) {
    case "done":
      return (
        <span className={base}>
          <CircleCheck aria-hidden="true" size={16} className={tw("text-ok")} />
          <span className={tw("sr-only")}>Done</span>
        </span>
      );
    case "failed":
      return (
        <span className={tw(base, "font-medium text-danger")}>
          <CircleAlert aria-hidden="true" size={16} />
          <span>Failed</span>
        </span>
      );
    default:
      return (
        <span className={tw(base, "text-graphite")}>
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
          className={tw("size-1 animate-rec-pulse rounded-full bg-current")}
          style={{ animationDelay: delay }}
        />
      ))}
    </span>
  );
}
