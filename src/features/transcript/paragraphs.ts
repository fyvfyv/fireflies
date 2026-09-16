import type { Segment } from "@shared/schemas";
import { formatTimestamp } from "@/lib/time";

export type TranscriptSegment = {
  /** Position in the original segment list; stable across paragraphs. */
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
  /** Position inside the paragraph's segments. */
  segment: number;
  /** Character range inside the segment's text. */
  start: number;
  end: number;
};

const PAUSE_SECONDS = 1.5;
const MAX_PARAGRAPH_SECONDS = 20;

const endsWithQuestion = (paragraph: Paragraph) =>
  paragraph.segments.at(-1)?.text.trimEnd().endsWith("?") ?? false;

/**
 * Whisper segments are sentence-sized; reading them one per line is choppy,
 * so they are joined into paragraphs. A paragraph breaks at a pause, after a
 * question (usually a change of speaker), or before it would pass 20 s, so
 * a long stretch of talk still gets a time anchor every few sentences.
 */
export function groupParagraphs(segments: readonly Segment[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: (Paragraph & { start: number; end: number }) | null = null;
  segments.forEach((segment, id) => {
    const text = segment.text.trim();
    if (!text) return;
    const item = {
      id,
      text,
      start: segment.startSecond,
      end: segment.endSecond,
    };
    const startsNew =
      current === null ||
      segment.startSecond - current.end >= PAUSE_SECONDS ||
      segment.endSecond - current.start > MAX_PARAGRAPH_SECONDS ||
      endsWithQuestion(current);
    if (startsNew || current === null) {
      current = {
        start: segment.startSecond,
        end: segment.endSecond,
        segments: [item],
      };
      paragraphs.push(current);
    } else {
      current.segments.push(item);
      current.end = Math.max(current.end, segment.endSecond);
    }
  });
  return paragraphs;
}

/** Transcripts from providers without timestamps: one paragraph per line. */
export function textParagraphs(text: string): Paragraph[] {
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

/** Case-insensitive plain-text matches, in reading order. */
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

/**
 * The segment being spoken at `seconds`. Pauses keep the previous segment,
 * so the highlight doesn't flicker off between sentences.
 */
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

/** Index of the paragraph to show for `seconds`; -1 without timestamps. */
export function paragraphAt(
  paragraphs: readonly Paragraph[],
  seconds: number,
): number {
  if (paragraphs[0]?.start === null || paragraphs.length === 0) return -1;
  let index = 0;
  paragraphs.forEach((paragraph, i) => {
    if (paragraph.start !== null && paragraph.start <= seconds) index = i;
  });
  return index;
}

/** Paragraphs for a stored transcript, timed when the provider gave segments. */
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
