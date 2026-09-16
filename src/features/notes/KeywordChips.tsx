import { SUMMARY_LIMITS } from "@shared/schemas";
import { tw } from "@tw";
import { Chip } from "@/components/ui/Chip";

export function KeywordChips({
  keywords,
  className,
}: {
  keywords: readonly string[];
  className?: string;
}) {
  const shown = keywords.slice(0, SUMMARY_LIMITS.keywords);
  if (shown.length === 0) return null;
  return (
    <ul
      aria-label="Keywords"
      className={tw("flex flex-wrap gap-1.5", className)}
    >
      {shown.map((keyword, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the model may repeat a keyword
        <li key={index} className={tw("max-w-full")}>
          {/* The chip is a flex box, where text-overflow has no effect. */}
          <Chip className={tw("min-w-0")}>
            <span className={tw("truncate")}>{keyword}</span>
          </Chip>
        </li>
      ))}
    </ul>
  );
}
