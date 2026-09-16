import type { MeetingListItem, Source } from "@shared/schemas";
import { tw } from "@tw";
import { AudioLines, SquareCheck } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Link } from "react-router";
import { SearchField } from "@/components/ui/SearchField";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  filterMeetings,
  groupByDay,
  rowTime,
  type TopicIndex,
  topicFor,
} from "@/features/home/meetingGroups";
import { useToday } from "@/features/home/useToday";
import { formatDuration } from "@/lib/time";
import { StatusBadge } from "./StatusBadge";

export const sourceLabels: Record<Source, string> = {
  mic: "Microphone",
  upload: "Uploaded file",
  demo: "Sample",
};

const swatches: Record<TopicIndex, string> = {
  1: "bg-topic-1",
  2: "bg-topic-2",
  3: "bg-topic-3",
  4: "bg-topic-4",
  5: "bg-topic-5",
  6: "bg-topic-6",
};

type MeetingListProps = {
  meetings: MeetingListItem[] | null;
  loading?: boolean;
  alert?: ReactNode;
  emptyActions?: ReactNode;
};

export function MeetingList({
  meetings,
  loading = false,
  alert,
  emptyActions,
}: MeetingListProps) {
  const headingId = useId();
  const [query, setQuery] = useState("");
  const now = useToday();
  const searchable = meetings !== null && meetings.length > 0;
  const visible = filterMeetings(meetings ?? [], query);
  const searching = searchable && query.trim() !== "";

  return (
    <section aria-labelledby={headingId} className={tw("space-y-5")}>
      <div
        className={tw(
          "flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-3",
        )}
      >
        <h2 id={headingId} className={tw("type-heading")}>
          Meetings
        </h2>
        {searchable && (
          <SearchField
            label="Search meetings"
            placeholder="Search meetings"
            value={query}
            onValueChange={setQuery}
            className={tw("w-full sm:w-72")}
          />
        )}
      </div>
      {/* Live regions must exist before their content changes. */}
      <p aria-live="polite" className={tw("sr-only")}>
        {searching ? resultCount(visible.length) : ""}
      </p>
      {alert}
      {meetings === null ? (
        loading && <SkeletonRows />
      ) : meetings.length === 0 ? (
        <EmptyState actions={emptyActions} />
      ) : visible.length > 0 ? (
        <div className={tw("space-y-7")}>
          {groupByDay(visible, now).map((group) => (
            <DayGroup
              key={group.label}
              label={group.label}
              meetings={group.items}
              now={now}
            />
          ))}
        </div>
      ) : (
        <p
          className={tw(
            "rounded-sheet border border-dashed border-rule px-6 py-10 text-center text-graphite",
          )}
        >
          No meetings match “{query.trim()}”.
        </p>
      )}
    </section>
  );
}

const resultCount = (count: number) =>
  count === 0
    ? "No results"
    : `${count} ${count === 1 ? "meeting" : "meetings"} found`;

function DayGroup({
  label,
  meetings,
  now,
}: {
  label: string;
  meetings: MeetingListItem[];
  now: Date;
}) {
  const headingId = useId();
  return (
    <div>
      <h3
        id={headingId}
        className={tw("mb-2 type-small font-medium text-graphite")}
      >
        {label}
      </h3>
      <ul
        aria-labelledby={headingId}
        className={tw(
          "divide-y divide-rule overflow-hidden rounded-sheet border border-rule bg-sheet",
        )}
      >
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <MeetingRow meeting={meeting} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const rowGrid = tw(
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5",
  "md:grid-cols-[auto_minmax(0,1fr)_7.5rem_4.5rem_3.5rem_5.75rem] md:gap-x-5 md:px-5",
);

function MeetingRow({ meeting, now }: { meeting: MeetingListItem; now: Date }) {
  const id = useId();
  const done = meeting.status === "done";
  const count = meeting.actionItemCount;
  const placeholder = (
    <span aria-hidden="true" className={tw("text-faint")}>
      –
    </span>
  );

  return (
    <Link
      to={`/m/${meeting.id}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-snippet ${id}-meta ${id}-status`}
      className={tw(
        rowGrid,
        "transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:-outline-offset-2",
      )}
    >
      <span
        aria-hidden="true"
        className={tw(
          "row-span-2 w-1 self-stretch rounded-full md:row-span-1",
          swatches[topicFor(meeting.id)],
        )}
      />
      <span className={tw("min-w-0")}>
        <span
          id={`${id}-title`}
          className={tw("block truncate font-medium text-ink")}
        >
          {meeting.title}
        </span>
        <span
          id={`${id}-snippet`}
          className={tw("mt-0.5 block truncate type-small text-graphite")}
        >
          {meeting.overviewSnippet ?? sourceLabels[meeting.source]}
        </span>
      </span>
      <span
        id={`${id}-status`}
        className={tw(
          "col-start-3 row-start-1 flex justify-end self-start type-small md:self-center",
        )}
      >
        <StatusBadge status={meeting.status} stalled={meeting.stalled} />
      </span>
      <span
        id={`${id}-meta`}
        className={tw(
          "col-span-2 col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-small text-graphite",
          "md:contents",
        )}
      >
        {/* Spaces for the aria description; flex and grid ignore them. */}
        <span className={tw("md:justify-self-end")}>
          {meeting.durationSeconds === null
            ? placeholder
            : formatDuration(meeting.durationSeconds)}
        </span>{" "}
        <span className={tw("md:justify-self-end")}>
          {done ? (
            <span className={tw("inline-flex items-center gap-1.5")}>
              <SquareCheck aria-hidden="true" size={14} />
              <span aria-hidden="true">{count}</span>
              <span className={tw("sr-only")}>
                {count} {count === 1 ? "action item" : "action items"}
              </span>
            </span>
          ) : (
            placeholder
          )}
        </span>{" "}
        <time
          dateTime={meeting.createdAt}
          className={tw("md:justify-self-end")}
        >
          {rowTime(meeting.createdAt, now)}
        </time>
      </span>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true">
      <span className={tw("sr-only")}>Loading meetings…</span>
      <Skeleton className={tw("mb-2.5 h-3 w-14")} />
      <div
        className={tw(
          "divide-y divide-rule overflow-hidden rounded-sheet border border-rule bg-sheet",
        )}
      >
        {[0, 1, 2].map((row) => (
          <div key={row} className={tw(rowGrid)}>
            <Skeleton
              className={tw(
                "row-span-2 h-full min-h-9 w-1 rounded-full md:row-span-1",
              )}
            />
            <div className={tw("min-w-0 space-y-2 py-0.5")}>
              <Skeleton className={tw("h-3.5 w-2/5")} />
              <Skeleton className={tw("h-3 w-4/5")} />
            </div>
            <Skeleton
              className={tw(
                "col-start-3 row-start-1 h-3 w-14 md:justify-self-end",
              )}
            />
            <div
              className={tw("col-span-2 col-start-2 flex gap-4 md:contents")}
            >
              <Skeleton className={tw("h-3 w-10 md:justify-self-end")} />
              <Skeleton className={tw("h-3 w-8 md:justify-self-end")} />
              <Skeleton className={tw("h-3 w-14 md:justify-self-end")} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ actions }: { actions?: ReactNode }) {
  return (
    <div
      className={tw(
        "flex flex-col items-center rounded-sheet border border-dashed border-rule px-6 py-12 text-center",
      )}
    >
      <div
        className={tw(
          "mb-4 grid size-12 place-items-center rounded-full bg-sunken text-graphite",
        )}
      >
        <AudioLines aria-hidden="true" size={22} />
      </div>
      <p className={tw("type-heading")}>No meetings yet</p>
      <p className={tw("mt-1 max-w-sm text-pretty text-graphite")}>
        Record one above, or start without a microphone: try the 2-minute sample
        or upload audio you already have.
      </p>
      {actions && <div className={tw("mt-6")}>{actions}</div>}
    </div>
  );
}
