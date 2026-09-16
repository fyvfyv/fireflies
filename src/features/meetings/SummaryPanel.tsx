import type { ActionItem, Summary } from "@shared/schemas";
import { tw } from "@tw";
import { type ReactNode, useId } from "react";

type SummaryPanelProps = {
  summary: Summary | null;
  truncated: boolean;
};

export function SummaryPanel({ summary, truncated }: SummaryPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={tw("space-y-4 rounded-lg border p-4")}
    >
      <h2 id={headingId} className={tw("font-semibold")}>
        Summary
      </h2>
      {summary ? (
        <>
          {truncated && (
            <p
              role="note"
              className={tw(
                "rounded-md bg-amber-50 p-3 text-body text-amber-800",
              )}
            >
              This meeting was too long to summarize in full, so the summary
              covers only the first part of the transcript.
            </p>
          )}
          <p className={tw("text-body")}>{summary.overview}</p>
          <SummarySection
            title="Key takeaways"
            items={summary.keyTakeaways}
            render={(takeaway) => takeaway}
          />
          <SummarySection
            title="Decisions"
            items={summary.decisions}
            render={(decision) => decision}
          />
          <SummarySection
            title="Action items"
            items={summary.actionItems}
            render={(item) => <ActionItemRow item={item} />}
          />
        </>
      ) : (
        <p className={tw("text-body text-neutral-500")}>
          The summary will appear here once processing finishes.
        </p>
      )}
    </section>
  );
}

function SummarySection<T>({
  title,
  items,
  render,
}: {
  title: string;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  const headingId = useId();
  return (
    <div className={tw("space-y-1")}>
      <h3 id={headingId} className={tw("text-body font-medium")}>
        {title}
      </h3>
      {items.length === 0 ? (
        <p className={tw("text-body text-neutral-500")}>None captured</p>
      ) : (
        <ul
          aria-labelledby={headingId}
          className={tw("list-disc space-y-1 pl-5 text-body")}
        >
          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list whose items may repeat verbatim
            <li key={index}>{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActionItemRow({ item }: { item: ActionItem }) {
  return (
    <div className={tw("flex flex-wrap items-center gap-x-2 gap-y-1")}>
      <span>{item.task}</span>
      {item.owner && (
        <Chip>
          <span className={tw("sr-only")}>Owner: </span>
          {item.owner}
        </Chip>
      )}
      {item.due && <Chip>Due {item.due}</Chip>}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className={tw(
        "rounded-full bg-neutral-100 px-2 py-0.5 text-caption text-neutral-700",
      )}
    >
      {children}
    </span>
  );
}
