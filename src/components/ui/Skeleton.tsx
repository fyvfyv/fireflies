import { tw } from "@tw";
import type { ComponentProps } from "react";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={tw(
        "skeleton animate-shimmer rounded-md motion-reduce:bg-none",
        className,
      )}
      {...props}
    />
  );
}
