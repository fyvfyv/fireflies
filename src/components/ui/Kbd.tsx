import { tw } from "@tw";
import type { ComponentProps } from "react";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={tw(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-rule bg-sheet px-1.5 font-sans text-caption text-graphite",
        className,
      )}
      {...props}
    />
  );
}
