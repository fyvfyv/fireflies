import { tw } from "@tw";
import { useState } from "react";
import { formatShortTime } from "@/lib/time";
import { usePlayerActions } from "./PlayerProvider";
import { releasePointerFocus } from "./releasePointerFocus";

/** A pseudo-element grows the touch target without moving text; the button needs `relative`. */
export const HIT_AREA =
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-['']";

export function TimestampMark({
  seconds,
  className,
}: {
  seconds: number;
  className?: string;
}) {
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
