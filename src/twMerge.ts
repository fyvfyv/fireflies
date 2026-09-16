import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Mirrors the custom --text-* tokens in index.css; without this tailwind-merge
// reads `text-caption` as a color and fails to dedupe it against `text-sm`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "body", "title"],
    },
  },
});

export function tw(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
