// Geometry and loudness math for the live waveform, kept free of canvas and
// Web Audio so it can be tested directly.

export const MIN_BARS = 40;
export const MAX_BARS = 64;
/** How long one bar collects loudness before the row shifts left. */
export const BAR_MS = 70;

const BAR_PITCH = 6;
const MIN_BAR_WIDTH = 2;
// Wider bars read as a chart rather than a voice.
const MAX_BAR_WIDTH = 4;

// Browsers apply gain control to microphone input, so speech mostly lands
// between -35 and -15 dBFS. Mapping -60..-10 dBFS onto the bar height keeps
// room noise flat; the curve stretches the speech range, so syllables and
// pauses read as different heights instead of a uniform block.
const FLOOR_DB = -60;
const CEILING_DB = -10;
const CURVE = 1.5;

// Per-frame smoothing at 60fps: fast enough that a 150ms pause drops to a
// dot, slow enough to hide single-frame flicker.
const ATTACK = 0.7;
const RELEASE = 0.3;

export type Bar = { x: number; y: number; width: number; height: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function barCountFor(width: number): number {
  return Math.min(MAX_BARS, Math.max(MIN_BARS, Math.floor(width / BAR_PITCH)));
}

/** Loudness of one block of time-domain samples (-1..1), as 0..1. */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / samples.length);
  if (rms === 0) return 0;
  const db = 20 * Math.log10(rms);
  return clamp01((db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)) ** CURVE;
}

/**
 * Shrinks a level history to at most `count` bars, each the loudest value of
 * its stretch, so short bursts of speech survive in an overview of a long
 * recording (an average would flatten them).
 */
export function maxPool(values: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const length = values.length;
  if (length <= count) return [...values];
  const pooled: number[] = [];
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * length) / count);
    const end = Math.max(
      start + 1,
      Math.floor(((bucket + 1) * length) / count),
    );
    let peak = -Infinity;
    for (let i = start; i < end; i++) peak = Math.max(peak, values[i] ?? 0);
    pooled.push(peak);
  }
  return pooled;
}

/** Per-frame smoothing: bars jump up with a syllable and settle slowly. */
export function smoothLevel(previous: number, next: number): number {
  const rate = next > previous ? ATTACK : RELEASE;
  return previous + (next - previous) * rate;
}

type LayoutInput = {
  width: number;
  height: number;
  /** Oldest first; the last one is drawn at the right edge. */
  levels: readonly number[];
  /** 0..1 of the way to the next shift, so the row scrolls smoothly. */
  progress?: number;
};

/**
 * Bars centered on the midline, newest on the right. Missing history is drawn
 * as dots (a bar as tall as it is wide), which is also the idle baseline.
 */
export function layoutBars({
  width,
  height,
  levels,
  progress = 0,
}: LayoutInput): Bar[] {
  const count = barCountFor(width);
  const pitch = width / count;
  const barWidth = Math.min(MAX_BAR_WIDTH, Math.max(MIN_BAR_WIDTH, pitch / 2));
  // One extra slot scrolls in from the left edge while the row moves.
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
