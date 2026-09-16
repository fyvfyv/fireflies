import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows default scales; unlisted, `text-caption` reads as a color.
const typeScale = [
  "caption",
  "small",
  "body",
  "lead",
  "heading",
  "title",
  "display",
  "timer",
];

const colors = [
  "paper",
  "sheet",
  "sunken",
  "ink",
  "graphite",
  "faint",
  "rule",
  "marker",
  "marker-ink",
  "rec",
  "danger",
  "ok",
  "topic-1",
  "topic-2",
  "topic-3",
  "topic-4",
  "topic-5",
  "topic-6",
];

const twMerge = extendTailwindMerge<"type">({
  extend: {
    theme: {
      text: typeScale,
      color: colors,
      radius: ["sheet", "control", "chip", "mark"],
      shadow: ["float"],
      ease: ["out-soft"],
      animate: [
        "marker-sweep",
        "reveal",
        "shimmer",
        "rec-pulse",
        "toast-in",
        "toast-out",
      ],
    },
    classGroups: {
      type: [{ type: typeScale }],
    },
    conflictingClassGroups: {
      type: ["font-size", "leading", "font-weight", "tracking", "font-stretch"],
      "font-size": ["type"],
    },
  },
});

export function tw(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
