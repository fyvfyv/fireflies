import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ActionItem, NoteSection } from "@shared/schemas";
import { tw } from "@tw";
import {
  type KeyboardEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { topicBackground } from "@/features/notes/topics";
import { formatShortTime } from "@/lib/time";
import { usePlayer } from "./PlayerProvider";
import { percentOf, spanAt, type TapeSpan, tapeSpans } from "./tape";

type TopicTapeProps = {
  sections: readonly Pick<NoteSection, "heading" | "startSecond">[];
  actionItems: readonly Pick<ActionItem, "startSecond">[];
  onScrub: (seconds: number | null) => void;
  className?: string;
};

const pct = (value: number) => `${value}%`;

function spanStyle(span: TapeSpan, duration: number) {
  const left = percentOf(span.start, duration);
  const width = percentOf(span.end, duration) - left;
  return { left: pct(left), width: `calc(${width}% - 2px)` };
}

function ActionTicks({
  items,
  duration,
}: {
  items: readonly Pick<ActionItem, "startSecond">[];
  duration: number;
}) {
  if (duration <= 0) return null;
  return items.map((item, index) =>
    item.startSecond === null ? null : (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: ticks follow the item order and never reorder
        key={index}
        data-slot="action-tick"
        aria-hidden="true"
        style={{ left: pct(percentOf(item.startSecond, duration)) }}
        className={tw(
          "pointer-events-none absolute top-0.5 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-ink",
        )}
      />
    ),
  );
}

// Fixed steps in seconds; radix's percentage-like steps vary wildly with recording length.
const STEP_KEYS: Record<string, number> = {
  ArrowRight: 5,
  ArrowUp: 5,
  ArrowLeft: -5,
  ArrowDown: -5,
  PageUp: 30,
  PageDown: -30,
};

// Only the thumb's positioning wrapper (a direct child of the root) moves.
const GLIDE =
  "[&>span:has(>[role=slider])]:transition-[left] [&>span:has(>[role=slider])]:duration-250 [&>span:has(>[role=slider])]:ease-linear";

export function TopicTape({
  sections,
  actionItems,
  onScrub,
  className,
}: TopicTapeProps) {
  const { currentTime, duration, playing, available, seek, skip } = usePlayer();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const spans = useMemo(
    () => tapeSpans(sections, duration),
    [sections, duration],
  );

  const disabled = !available || duration <= 0;
  const max = duration > 0 ? duration : 1;
  const value = Math.min(scrub ?? currentTime, max);
  const started = playing || currentTime > 0 || scrub !== null;
  const topic = spanAt(spans, value);
  const valueText = `${formatShortTime(value)} of ${formatShortTime(duration)}${topic ? `, ${topic.heading}` : ""}`;

  const updateScrub = (next: number | null) => {
    setScrub(next);
    onScrub(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const delta = STEP_KEYS[event.key];
    if (delta !== undefined) {
      // A prevented event skips radix's own key handling.
      event.preventDefault();
      skip(delta);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      seek(event.key === "Home" ? 0 : duration);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (disabled || event.pointerType !== "mouse" || !rect?.width) return;
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1,
    );
    setHover(ratio * duration);
  };

  const hoverTopic = hover === null ? undefined : spanAt(spans, hover);
  const hoverPercent = hover === null ? 0 : percentOf(hover, duration);

  return (
    <SliderPrimitive.Root
      ref={rootRef}
      min={0}
      max={max}
      step={0.1}
      value={[value]}
      disabled={disabled}
      onValueChange={([next]) => updateScrub(next ?? null)}
      onValueCommit={([next]) => {
        updateScrub(null);
        if (next !== undefined) seek(next);
      }}
      // A drag that ends where it started commits nothing; drop the preview.
      onPointerUp={() => updateScrub(null)}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
      className={tw(
        "relative flex h-8 w-full touch-none items-center select-none data-disabled:opacity-50",
        playing && scrub === null && GLIDE,
        className,
      )}
    >
      <ActionTicks items={actionItems} duration={duration} />
      <SliderPrimitive.Track
        data-slot="track"
        className={tw(
          "relative h-2 w-full overflow-hidden rounded-full bg-sunken",
        )}
      >
        {spans.map((span) => (
          <span
            key={span.index}
            data-slot="topic-span"
            className={tw(
              "absolute inset-y-0 rounded-[3px]",
              topicBackground(span.index),
            )}
            style={spanStyle(span, duration)}
          />
        ))}
        {started && duration > 0 && (
          <span
            className={tw(
              "absolute inset-y-0 right-0 bg-sheet/55",
              playing &&
                scrub === null &&
                "transition-[left] duration-250 ease-linear",
            )}
            style={{ left: pct(percentOf(value, duration)) }}
          />
        )}
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label="Seek"
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        // Zero width, so radix doesn't shift it inward at the ends and the needle lines up with the spans.
        className={tw("group/thumb block h-6 w-0 outline-none")}
      >
        <span
          aria-hidden="true"
          className={tw(
            "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-ink",
          )}
        />
        <span
          aria-hidden="true"
          className={tw(
            "absolute top-0 left-1/2 size-2.5 -translate-1/2 rounded-full bg-ink ring-2 ring-sheet transition-transform duration-150",
            "group-hover/thumb:scale-125 group-focus-visible/thumb:outline-2 group-focus-visible/thumb:outline-offset-2 group-focus-visible/thumb:outline-ink",
          )}
        />
      </SliderPrimitive.Thumb>
      {hover !== null && (
        <span
          aria-hidden="true"
          data-slot="hover-preview"
          style={{
            left: pct(hoverPercent),
            transform: `translateX(-${hoverPercent}%)`,
          }}
          className={tw(
            "pointer-events-none absolute bottom-full mb-1 flex max-w-64 flex-col rounded-md bg-ink px-2 py-1 type-caption whitespace-nowrap text-sheet shadow-float",
          )}
        >
          {hoverTopic && (
            <span className={tw("truncate font-medium")}>
              {hoverTopic.heading}
            </span>
          )}
          <span className={tw("opacity-75")}>{formatShortTime(hover)}</span>
        </span>
      )}
    </SliderPrimitive.Root>
  );
}
