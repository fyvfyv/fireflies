import type { MeetingListItem, Source } from "@shared/schemas";
import { tw } from "@tw";
import { Link } from "react-router";
import { formatDuration, formatRelative } from "@/lib/time";
import { StatusBadge } from "./StatusBadge";

export const sourceLabels: Record<Source, string> = {
  mic: "Microphone",
  upload: "Uploaded file",
  demo: "Sample",
};

export function MeetingList({ meetings }: { meetings: MeetingListItem[] }) {
  if (meetings.length === 0) return <EmptyState />;
  return (
    <ul className={tw("divide-y divide-neutral-200 rounded-lg border")}>
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <MeetingRow meeting={meeting} />
        </li>
      ))}
    </ul>
  );
}

function MeetingRow({ meeting }: { meeting: MeetingListItem }) {
  const { actionItemCount: count } = meeting;
  const meta = [
    sourceLabels[meeting.source],
    meeting.durationSeconds === null
      ? null
      : formatDuration(meeting.durationSeconds),
    meeting.status === "done"
      ? `${count} action ${count === 1 ? "item" : "items"}`
      : null,
    formatRelative(meeting.createdAt),
  ].filter((part) => part !== null);

  return (
    <Link
      to={`/m/${meeting.id}`}
      className={tw("block space-y-1 p-4 hover:bg-neutral-50")}
    >
      <div className={tw("flex items-center justify-between gap-3")}>
        <span className={tw("truncate font-medium")}>{meeting.title}</span>
        <StatusBadge status={meeting.status} stalled={meeting.stalled} />
      </div>
      {meeting.overviewSnippet && (
        <p className={tw("line-clamp-2 text-body text-neutral-600")}>
          {meeting.overviewSnippet}
        </p>
      )}
      <div
        className={tw(
          "flex flex-wrap gap-x-3 gap-y-1 text-caption text-neutral-500",
        )}
      >
        {meta.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </div>
    </Link>
  );
}

// The recorder and the mic-free buttons sit right above the list, so the
// empty state points at them instead of repeating the controls.
function EmptyState() {
  return (
    <div className={tw("rounded-lg border border-dashed p-6 text-center")}>
      <p className={tw("font-medium")}>No meetings yet</p>
      <ul
        aria-label="Ways to start"
        className={tw("mt-2 space-y-1 text-body text-neutral-600")}
      >
        <li>
          <strong>Record</strong> a meeting with your microphone.
        </li>
        <li>
          <strong>Try a sample</strong>: a 2-minute team standup.
        </li>
        <li>
          <strong>Upload audio</strong> you already recorded.
        </li>
      </ul>
    </div>
  );
}
