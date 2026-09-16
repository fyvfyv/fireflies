import { z } from "zod";
import {
  type Segment,
  SUMMARY_LIMITS,
  type Summary,
} from "../../shared/schemas.js";

// No bounds or defaults: providers ignore limits while generating, and the SDK makes defaulted fields optional.
const llmMoment = z.number().nullable();

export const llmSummarySchema = z.object({
  title: z.string(),
  overview: z.string(),
  keywords: z.array(z.string()),
  notes: z.array(
    z.object({
      heading: z.string(),
      gist: z.string(),
      startSecond: llmMoment,
      points: z.array(
        z.object({
          text: z.string(),
          startSecond: llmMoment,
          details: z.array(z.string()),
        }),
      ),
    }),
  ),
  keyTakeaways: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      due: z.string().nullable(),
      startSecond: llmMoment,
    }),
  ),
});
export type LlmSummary = z.infer<typeof llmSummarySchema>;

type Snap = (value: number | null) => number | null;

export function momentSnapper(segments: Segment[] | null): Snap {
  const starts = (segments ?? [])
    .map((segment) => segment.startSecond)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const first = starts[0];
  const last = starts.at(-1);
  if (first === undefined || last === undefined) return () => null;
  return (value) => {
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    const target = Math.min(value, last);
    // Prompt labels are whole seconds, so a label names the first line carrying it.
    const labelled = starts.find((start) => Math.floor(start) === target);
    if (labelled !== undefined) return Math.max(0, labelled);
    let snapped = first;
    for (const start of starts) {
      if (start > target) break;
      snapped = start;
    }
    return Math.max(0, snapped);
  };
}

// `>`, `-`, `+` before an amount mean more-than/minus/plus, so they stay.
const LEADING_MARKERS =
  /^(?:#{1,6}|[->+](?!\s*[\d$€£])|[*•]|\d{1,2}[.)])(?:\s+|$)/;

// Code spans become private-use placeholders so emphasis rules can't eat `_` or `*`.
const CODE_SPAN = /`([^`]*)`/g;
const CODE_PLACEHOLDER = /\uE000(\d+)\uE001/g;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/(^|\W)__(?=\S)(.*?\S)__(?!\w)/g, "$1$2")
    .replace(/(^|\W)_(?=\S)([^_]*?\S)_(?!\w)/g, "$1$2")
    .replace(/\*{3,}/g, "**")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, "$1$2");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clean(text: string, keepBold: boolean): string {
  let rest = collapse(text.replace(/[\uE000\uE001]/g, ""));
  for (let m = LEADING_MARKERS.exec(rest); m; m = LEADING_MARKERS.exec(rest)) {
    rest = rest.slice(m[0].length);
  }
  const code: string[] = [];
  const restoreCode = (value: string) =>
    value.replace(CODE_PLACEHOLDER, (_, i: string) => code[Number(i)] ?? "");
  let body = stripInlineMarkdown(
    rest.replace(CODE_SPAN, (_, inner: string) => {
      code.push(inner);
      return `\uE000${code.length - 1}\uE001`;
    }),
  );
  if (keepBold) body = restoreCode(body);
  const parts = body.split("**");
  if (parts.length % 2 === 0) {
    const tail = parts.pop() ?? "";
    parts.push(`${parts.pop() ?? ""}${tail}`);
  }
  const joined = parts
    .map((part, i) => {
      if (i % 2 === 0) return part;
      const [, lead = "", inner = "", trail = ""] =
        /^(\s*)(.*?)(\s*)$/s.exec(part) ?? [];
      return keepBold && inner ? `${lead}**${inner}**${trail}` : part;
    })
    .join("");
  return collapse(keepBold ? joined : restoreCode(joined));
}

export function plainText(text: string): string {
  return clean(text, false);
}

export function richText(text: string): string {
  return clean(text, true);
}

function plainList(items: string[], max: number): string[] {
  return items.map(plainText).filter(Boolean).slice(0, max);
}

function keywordList(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => plainText(item).replace(/^#+/, "").trim())
    .filter((keyword) => {
      const key = keyword.toLocaleLowerCase();
      if (!keyword || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SUMMARY_LIMITS.keywords);
}

const optionalText = (text: string | null) => plainText(text ?? "") || null;

export function finalizeSummary(
  raw: LlmSummary,
  segments: Segment[] | null,
): Summary {
  const snap = momentSnapper(segments);
  const notes = raw.notes
    .map((section) => ({
      heading: plainText(section.heading),
      gist: plainText(section.gist),
      startSecond: snap(section.startSecond),
      points: section.points
        .map((point) => ({
          text: richText(point.text),
          startSecond: snap(point.startSecond),
          details: plainList(point.details, SUMMARY_LIMITS.detailsPerPoint),
        }))
        .filter((point) => point.text)
        .slice(0, SUMMARY_LIMITS.pointsPerSection),
    }))
    .filter((section) => section.heading)
    .slice(0, SUMMARY_LIMITS.sections);
  const title = plainText(raw.title).slice(0, SUMMARY_LIMITS.titleChars);
  const overview = plainText(raw.overview);
  const actionItems = raw.actionItems
    .map((item) => ({
      task: plainText(item.task),
      owner: optionalText(item.owner),
      due: optionalText(item.due),
      startSecond: snap(item.startSecond),
    }))
    .filter((item) => item.task)
    .slice(0, SUMMARY_LIMITS.actionItems);
  return {
    title,
    overview,
    keywords: keywordList(raw.keywords),
    // A done summary without notes reads as legacy (POST /notes redoes it), so keep one section.
    notes:
      notes.length > 0
        ? notes
        : [
            {
              heading: title || "Summary",
              gist: overview,
              startSecond: snap(0),
              points: [],
            },
          ],
    keyTakeaways: plainList(raw.keyTakeaways, SUMMARY_LIMITS.keyTakeaways),
    decisions: plainList(raw.decisions, SUMMARY_LIMITS.decisions),
    actionItems,
  };
}
