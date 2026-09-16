import { tw } from "@tw";
import { useState } from "react";
import { formatShortTime } from "@/lib/time";
import { usePlayerActions } from "./PlayerProvider";
import { releasePointerFocus } from "./releasePointerFocus";

/**
 * An inline 18px mark is the main way into the audio on phones. The
 * pseudo-element grows the touch target without moving any text; the
 * button needs `relative` for it.
 */
export const HIT_AREA =
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-['']";

type TimestampMarkProps = {
  seconds: number;
  /** Runs on every activation, also when there is no playable audio. */
  onJump?: (seconds: number) => void;
  className?: string;
};

/** A highlighter stroke with the moment's time; plays the recording from it. */
export function TimestampMark({
  seconds,
  onJump,
  className,
}: TimestampMarkProps) {
  const { seek } = usePlayerActions();
  const [sweeps, setSweeps] = useState(0);
  const time = formatShortTime(seconds);

  return (
    <button
      type="button"
      aria-label={`Play from ${time}`}
      onClick={(event) => {
        setSweeps((count) => count + 1);
        seek(seconds, { play: true });
        onJump?.(seconds);
        releasePointerFocus(event);
      }}
      className={tw(
        "group/mark relative inline-flex shrink-0 rounded-mark align-baseline",
        HIT_AREA,
        className,
      )}
    >
      <span
        // A new key remounts the stroke, which restarts the sweep animation.
        key={sweeps}
        data-slot="stroke"
        className={tw(
          "marker px-1 type-small font-medium whitespace-nowrap transition-[filter] duration-150",
          "group-hover/mark:brightness-95 group-active/mark:brightness-90",
          sweeps > 0 && "animate-marker-sweep",
        )}
      >
        {time}
      </span>
    </button>
  );
}
