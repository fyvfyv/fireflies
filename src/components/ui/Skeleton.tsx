import { tw } from "@tw";
import type { ComponentProps } from "react";

/** Placeholder block; size it with className (e.g. `h-4 w-2/3`). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={tw(
        // A still sheen band would look like a glitch, so reduced motion
        // drops the band along with the animation.
        "skeleton animate-shimmer rounded-md motion-reduce:bg-none",
        className,
      )}
      {...props}
    />
  );
}
