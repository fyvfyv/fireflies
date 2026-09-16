import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Mirrors the custom tokens in index.css. tailwind-merge only knows Tailwind's
// default scales: without this it reads `text-caption` as a color,
// `shadow-float` as a shadow color and ignores `rounded-sheet`, so conflicting
// classes would both survive and the stylesheet order would pick the winner.
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
      // `type-*` (index.css) sets size, line height, weight, width and
      // tracking at once.
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
