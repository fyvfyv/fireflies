import type { Segment } from "@shared/schemas";
import { formatTimestamp } from "@/lib/time";

type TranscriptSegment = {
  id: number;
  text: string;
  start: number | null;
  end: number | null;
};

export type Paragraph = {
  start: number | null;
  end: number | null;
  segments: TranscriptSegment[];
};

export type MatchRef = {
  paragraph: number;
  segment: number;
  start: number;
  end: number;
};

const PAUSE_SECONDS = 1.5;
const MAX_PARAGRAPH_SECONDS = 20;

/** Breaks after a question (usually a speaker change) and every 20 s, so long talk keeps time anchors. */
export function groupParagraphs(segments: readonly Segment[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: (Paragraph & { start: number; end: number }) | null = null;
  for (const [id, segment] of segments.entries()) {
    const text = segment.text.trim();
    if (!text) continue;
    const { startSecond: start, endSecond: end } = segment;
    const item = { id, text, start, end };
    if (
      current &&
      start - current.end < PAUSE_SECONDS &&
      end - current.start <= MAX_PARAGRAPH_SECONDS &&
      !current.segments.at(-1)?.text.endsWith("?")
    ) {
      current.segments.push(item);
      current.end = Math.max(current.end, end);
    } else {
      current = { start, end, segments: [item] };
      paragraphs.push(current);
    }
  }
  return paragraphs;
}

function textParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, id) => ({
      start: null,
      end: null,
      segments: [{ id, text: line, start: null, end: null }],
    }));
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findMatches(
  paragraphs: readonly Paragraph[],
  query: string,
): MatchRef[] {
  const needle = query.trim();
  if (!needle) return [];
  // A regex keeps offsets in the original text, which lowercasing may not.
  const pattern = new RegExp(escapeRegExp(needle), "giu");
  const matches: MatchRef[] = [];
  paragraphs.forEach((paragraph, p) => {
    paragraph.segments.forEach((segment, s) => {
      for (const match of segment.text.matchAll(pattern)) {
        matches.push({
          paragraph: p,
          segment: s,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    });
  });
  return matches;
}

/** Pauses keep the previous segment, so the highlight doesn't flicker between sentences. */
export function activeSegment(
  paragraphs: readonly Paragraph[],
  seconds: number,
): number | null {
  let active: number | null = null;
  for (const paragraph of paragraphs) {
    for (const segment of paragraph.segments) {
      if (segment.start === null || segment.start > seconds) return active;
      active = segment.id;
    }
  }
  return active;
}

export function paragraphAt(
  paragraphs: readonly Paragraph[],
  seconds: number,
): number {
  if (!paragraphs[0] || paragraphs[0].start === null) return -1;
  let index = 0;
  paragraphs.forEach((paragraph, i) => {
    if (paragraph.start !== null && paragraph.start <= seconds) index = i;
  });
  return index;
}

export function transcriptParagraphs(
  text: string,
  segments: readonly Segment[] | null,
): Paragraph[] {
  if (!text.trim()) return [];
  return segments?.length ? groupParagraphs(segments) : textParagraphs(text);
}

export function transcriptForClipboard(
  text: string,
  segments: readonly Segment[] | null,
): string {
  return transcriptToText(transcriptParagraphs(text, segments));
}

export function transcriptToText(paragraphs: readonly Paragraph[]): string {
  return paragraphs
    .map((paragraph) => {
      const text = paragraph.segments.map((segment) => segment.text).join(" ");
      return paragraph.start === null
        ? text
        : `[${formatTimestamp(paragraph.start)}] ${text}`;
    })
    .join("\n\n");
}
