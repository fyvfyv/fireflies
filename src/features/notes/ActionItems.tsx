import type { ActionItem } from "@shared/schemas";
import { tw } from "@tw";
import { Check, ListChecks } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Chip } from "@/components/ui/Chip";
import { TimestampMark } from "@/features/player/TimestampMark";
import { actionItemKey, groupByOwner, useDoneItems } from "./actionItemState";

type ActionItemsProps = {
  meetingId: string;
  items: readonly ActionItem[];
  /** Level of the owner headings, one below the surrounding heading. */
  headingLevel?: 2 | 3;
  className?: string;
};

export function ActionItems({
  meetingId,
  items,
  headingLevel = 3,
  className,
}: ActionItemsProps) {
  const done = useDoneItems(meetingId);
  const groups = groupByOwner(items);

  if (groups.length === 0) {
    return (
      <p
        className={tw(
          "flex flex-col items-center gap-2 py-10 text-center type-body text-graphite",
          className,
        )}
      >
        <ListChecks aria-hidden="true" size={20} className={tw("text-faint")} />
        No action items were mentioned.
      </p>
    );
  }

  return (
    <div className={tw("space-y-5", className)}>
      {groups.map((group) => (
        <OwnerGroup
          key={group.owner ?? ""}
          owner={group.owner ?? "Unassigned"}
          headingLevel={headingLevel}
        >
          {group.entries.map(({ item, index }) => {
            const key = actionItemKey(item, index);
            return (
              <ActionItemRow
                key={key}
                item={item}
                checked={done.isDone(key)}
                onToggle={() => done.toggle(key)}
              />
            );
          })}
        </OwnerGroup>
      ))}
    </div>
  );
}

function OwnerGroup({
  owner,
  headingLevel,
  children,
}: {
  owner: string;
  headingLevel: 2 | 3;
  children: ReactNode;
}) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={headingId}>
      <Heading
        id={headingId}
        className={tw("mb-1 type-small font-semibold text-graphite")}
      >
        {owner}
      </Heading>
      <ul className={tw("divide-y divide-rule")}>{children}</ul>
    </section>
  );
}

function ActionItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ActionItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const inputId = useId();
  return (
    <li className={tw("flex items-start gap-3 py-2.5")}>
      <span className={tw("relative mt-[3px] grid size-4.5 shrink-0")}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className={tw(
            "peer size-4.5 cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-faint bg-sheet transition-colors",
            "hover:border-graphite checked:border-ink checked:bg-ink",
          )}
        />
        <Check
          aria-hidden="true"
          size={12}
          strokeWidth={3}
          className={tw(
            "pointer-events-none absolute inset-0 m-auto text-sheet opacity-0 transition-opacity peer-checked:opacity-100",
          )}
        />
      </span>
      <div
        className={tw(
          "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1",
        )}
      >
        <label
          htmlFor={inputId}
          className={tw(
            "min-w-0 cursor-pointer type-body text-pretty text-ink transition-colors",
            checked && "text-graphite line-through decoration-faint",
          )}
        >
          {item.task}
        </label>
        {item.due && <Chip>Due {item.due}</Chip>}
        {item.startSecond !== null && (
          <TimestampMark seconds={item.startSecond} />
        )}
      </div>
    </li>
  );
}
