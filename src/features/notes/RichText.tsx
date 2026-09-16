import { tw } from "@tw";

type RichSpan = { text: string; bold: boolean };

const BOLD = /\*\*(.+?)\*\*/g;

export function parseRichText(text: string): RichSpan[] {
  const spans: RichSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) {
      spans.push({ text: text.slice(last, match.index), bold: false });
    }
    spans.push({ text: match[1] ?? "", bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false });
  return spans;
}

/** Rendered as React text, never as HTML. */
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
