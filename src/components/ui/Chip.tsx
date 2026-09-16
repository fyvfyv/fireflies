import { tw } from "@tw";
import type { ComponentProps } from "react";

const tones = {
  neutral: "bg-sunken text-graphite",
  marker: "bg-marker text-marker-ink",
} as const;

type ChipProps = ComponentProps<"span"> & {
  tone?: keyof typeof tones;
};

export function Chip({ tone = "neutral", className, ...props }: ChipProps) {
  return (
    <span
      className={tw(
        "inline-flex max-w-full items-center gap-1 rounded-chip px-2.5 py-0.5 text-caption whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
