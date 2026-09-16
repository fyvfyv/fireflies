import { tw } from "@tw";
import type { ComponentProps } from "react";

export function Chip({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={tw(
        "inline-flex max-w-full items-center gap-1 rounded-chip bg-sunken px-2.5 py-0.5 text-caption whitespace-nowrap text-graphite",
        className,
      )}
      {...props}
    />
  );
}
