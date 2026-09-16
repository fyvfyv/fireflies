const MIN_BARS = 40;
export const MAX_BARS = 64;
export const BAR_MS = 70;

const BAR_PITCH = 6;
const MIN_BAR_WIDTH = 2;
const MAX_BAR_WIDTH = 4;

// Browser AGC puts speech at -35..-15 dBFS; -60..-10 keeps room noise flat.
const FLOOR_DB = -60;
const CEILING_DB = -10;
const CURVE = 1.5;

// At 60fps: a 150ms pause drops to a dot; one-frame flicker is hidden.
const ATTACK = 0.7;
const RELEASE = 0.3;

type Bar = { x: number; y: number; width: number; height: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function barCountFor(width: number): number {
  return Math.min(MAX_BARS, Math.max(MIN_BARS, Math.floor(width / BAR_PITCH)));
}

export function levelFromSamples(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  const db = 20 * Math.log10(Math.sqrt(sum / samples.length));
  return clamp01((db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)) ** CURVE;
}

// Max, not average, so short bursts of speech survive in the overview.
export function maxPool(values: readonly number[], count: number): number[] {
  const length = values.length;
  if (length <= count) return [...values];
  const pooled: number[] = [];
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * length) / count);
    const end = Math.floor(((bucket + 1) * length) / count);
    let peak = -Infinity;
    for (let i = start; i < end; i++) peak = Math.max(peak, values[i] ?? 0);
    pooled.push(peak);
  }
  return pooled;
}

export function smoothLevel(previous: number, next: number): number {
  const rate = next > previous ? ATTACK : RELEASE;
  return previous + (next - previous) * rate;
}

export function layoutBars({
  width,
  height,
  levels,
  progress,
}: {
  width: number;
  height: number;
  levels: readonly number[];
  progress: number;
}): Bar[] {
  const count = barCountFor(width);
  const pitch = width / count;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, pitch / 2));
  const slots = count + 1;
  const recent = levels.slice(-slots);
  const padding = slots - recent.length;
  const bars: Bar[] = [];
  for (let slot = 0; slot < slots; slot++) {
    const center =
      width - pitch * (slots - 1 - slot) - pitch / 2 - progress * pitch;
    const x = center - barWidth / 2;
    if (x + barWidth <= 0) continue;
    const level = slot < padding ? 0 : clamp01(recent[slot - padding] ?? 0);
    const barHeight = Math.max(barWidth, level * height);
    bars.push({
      x,
      y: (height - barHeight) / 2,
      width: barWidth,
      height: barHeight,
    });
  }
  return bars;
}
