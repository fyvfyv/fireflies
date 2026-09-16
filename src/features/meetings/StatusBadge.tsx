import type { MeetingStatus } from "@shared/schemas";
import { tw } from "@tw";

const badges: Record<MeetingStatus, { label: string; tone: string }> = {
  uploaded: { label: "Uploaded", tone: "bg-neutral-100 text-neutral-700" },
  transcribing: { label: "Transcribing", tone: "bg-sky-100 text-sky-800" },
  transcribed: { label: "Transcribed", tone: "bg-sky-100 text-sky-800" },
  summarizing: { label: "Summarizing", tone: "bg-sky-100 text-sky-800" },
  done: { label: "Done", tone: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-800" },
};

const interrupted = {
  label: "Interrupted",
  tone: "bg-amber-100 text-amber-800",
};

export function StatusBadge({
  status,
  stalled,
}: {
  status: MeetingStatus;
  stalled: boolean;
}) {
  const { label, tone } = stalled ? interrupted : badges[status];
  return (
    <span
      className={tw(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-caption font-medium",
        tone,
      )}
    >
      {label}
    </span>
  );
}
