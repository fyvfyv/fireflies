export type TapeSpan = {
  index: number;
  heading: string;
  start: number;
  end: number;
};

type TapeSection = { heading: string; startSecond: number | null };

const usable = (duration: number) => Number.isFinite(duration) && duration > 0;

/** Model sections may be unordered or untimed: sort, clamp, and drop zero-width spans. */
export function tapeSpans(
  sections: readonly TapeSection[],
  duration: number,
): TapeSpan[] {
  if (!usable(duration)) return [];
  const timed = sections
    .flatMap((section, index) =>
      section.startSecond === null || !Number.isFinite(section.startSecond)
        ? []
        : [
            {
              index,
              heading: section.heading,
              start: Math.min(Math.max(section.startSecond, 0), duration),
            },
          ],
    )
    .sort((a, b) => a.start - b.start);
  return timed
    .map((span, i) => ({ ...span, end: timed[i + 1]?.start ?? duration }))
    .filter((span) => span.end > span.start);
}

export function spanAt(
  spans: readonly TapeSpan[],
  seconds: number,
): TapeSpan | undefined {
  const last = spans.at(-1);
  if (last && seconds >= last.end) return last;
  return spans.find((span) => seconds >= span.start && seconds < span.end);
}

export function percentOf(seconds: number, duration: number): number {
  if (!usable(duration)) return 0;
  return Math.min(Math.max(seconds / duration, 0), 1) * 100;
}
