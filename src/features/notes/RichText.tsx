import { tw } from "@tw";

export type RichSpan = { text: string; bold: boolean };

// Non-greedy and at least one character, so "****" and a lone "**" stay text.
const BOLD = /\*\*(.+?)\*\*/g;

/** Splits model output on `**bold**` pairs; nothing else is interpreted. */
export function parseRichText(text: string): RichSpan[] {
  const spans: RichSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    const start = match.index;
    if (start > last)
      spans.push({ text: text.slice(last, start), bold: false });
    spans.push({ text: match[1] ?? "", bold: true });
    last = start + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans;
}

export function stripRichText(text: string): string {
  return parseRichText(text)
    .map((span) => span.text)
    .join("");
}

/** Model text with `**bold**` spans; rendered as React text, never as HTML. */
export function RichText({ text }: { text: string }) {
  return parseRichText(text).map((span, index) =>
    span.bold ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: spans are positional and never reorder
      <strong key={index} className={tw("font-[650] text-ink")}>
        {span.text}
      </strong>
    ) : (
      span.text
    ),
  );
}
