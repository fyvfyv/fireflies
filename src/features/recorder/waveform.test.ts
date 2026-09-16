import { describe, expect, it } from "vitest";
import {
  barCountFor,
  layoutBars,
  levelFromSamples,
  MAX_BARS,
  MIN_BARS,
  maxPool,
  smoothLevel,
} from "./waveform";

describe("barCountFor", () => {
  it("fits one bar per 6px", () => {
    expect(barCountFor(300)).toBe(50);
  });

  it("keeps between 40 and 64 bars", () => {
    expect(barCountFor(0)).toBe(MIN_BARS);
    expect(barCountFor(100)).toBe(MIN_BARS);
    expect(barCountFor(1000)).toBe(MAX_BARS);
  });
});

describe("levelFromSamples", () => {
  it("is 0 for silence and for no samples", () => {
    expect(levelFromSamples(new Float32Array(64))).toBe(0);
    expect(levelFromSamples(new Float32Array(0))).toBe(0);
  });

  it("is 1 for a full-scale signal", () => {
    expect(levelFromSamples(new Float32Array(64).fill(1))).toBe(1);
  });

  it("spreads speech levels over the height so syllables stand apart", () => {
    const at = (db: number) =>
      levelFromSamples(new Float32Array(64).fill(10 ** (db / 20)));

    // Browsers apply gain control, so speech mostly lands at -35..-15 dBFS.
    expect(at(-15)).toBeGreaterThan(0.8);
    expect(at(-30)).toBeGreaterThan(0.4);
    expect(at(-30)).toBeLessThan(0.5);
    expect(at(-40)).toBeLessThan(0.3);
    // -70 dBFS room noise stays flat.
    expect(at(-70)).toBe(0);
  });

  it("grows with loudness", () => {
    const levels = [-60, -50, -40, -30, -20, -10].map((db) =>
      levelFromSamples(new Float32Array(8).fill(10 ** (db / 20))),
    );

    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("uses the RMS of positive and negative samples alike", () => {
    const wave = Float32Array.from({ length: 64 }, (_, i) =>
      i % 2 ? 0.1 : -0.1,
    );
    expect(levelFromSamples(wave)).toBeCloseTo(
      levelFromSamples(new Float32Array(64).fill(0.1)),
    );
  });
});

describe("smoothLevel", () => {
  it("falls fast enough for a short pause to show", () => {
    let level = 1;
    // About 150 ms at 60 frames per second.
    for (let i = 0; i < 9; i++) level = smoothLevel(level, 0);

    expect(level).toBeLessThan(0.1);
  });

  it("rises faster than it falls", () => {
    const rise = smoothLevel(0, 1);
    const fall = 1 - smoothLevel(1, 0);

    expect(rise).toBeGreaterThan(fall);
    expect(rise).toBeLessThanOrEqual(1);
    expect(fall).toBeGreaterThan(0);
  });

  it("settles on a steady level", () => {
    let level = 0;
    for (let i = 0; i < 60; i++) level = smoothLevel(level, 0.5);

    expect(level).toBeCloseTo(0.5);
  });
});

describe("layoutBars", () => {
  const size = { width: 240, height: 48 };

  it("draws a flat row of centered dots without levels", () => {
    const bars = layoutBars({ ...size, levels: [] });

    expect(bars).toHaveLength(40);
    for (const bar of bars) {
      expect(bar).toMatchObject({ width: 3, height: 3, y: 22.5 });
    }
    expect(bars[0]?.x).toBe(1.5);
    expect(bars.at(-1)?.x).toBe(235.5);
  });

  it("puts the newest level at the right edge", () => {
    const bars = layoutBars({ ...size, levels: [0.5, 1] });

    expect(bars.at(-1)).toMatchObject({ x: 235.5, y: 0, height: 48 });
    expect(bars.at(-2)).toMatchObject({ x: 229.5, y: 12, height: 24 });
    expect(bars.at(-3)).toMatchObject({ height: 3 });
  });

  it("slides every bar left while the next level builds up", () => {
    const still = layoutBars({ ...size, levels: [1] });
    const moving = layoutBars({ ...size, levels: [1], progress: 0.5 });

    expect(moving.at(-1)?.x).toBe((still.at(-1)?.x ?? 0) - 3);
    // The oldest slot slides in from the left edge, so the row stays full.
    expect(moving).toHaveLength(40);
    expect(moving[0]?.x).toBe(-1.5);
  });

  it("only draws the levels that fit", () => {
    const levels = Array.from({ length: 100 }, (_, i) => (i < 59 ? 1 : 0));

    const bars = layoutBars({ ...size, levels });

    expect(bars).toHaveLength(40);
    expect(bars.every((bar) => bar.height === 3)).toBe(true);
  });

  it("clamps levels outside 0..1", () => {
    const bars = layoutBars({ ...size, levels: [-1, 2] });

    expect(bars.at(-2)?.height).toBe(3);
    expect(bars.at(-1)?.height).toBe(48);
  });

  it("keeps bars thin on wide canvases", () => {
    const bars = layoutBars({ width: 1000, height: 48, levels: [] });

    expect(bars).toHaveLength(64);
    expect(bars[0]?.width).toBe(4);
  });
});

describe("maxPool", () => {
  it("keeps the loudest value of each bucket", () => {
    expect(maxPool([1, 5, 2, 8, 3, 4], 3)).toEqual([5, 8, 4]);
  });

  it("covers every value when the length doesn't divide evenly", () => {
    expect(maxPool([9, 0, 0, 0, 0, 0, 7], 3)).toEqual([9, 0, 7]);
  });

  it("returns a copy when there is room for every value", () => {
    const values = [1, 2];
    const pooled = maxPool(values, 5);

    expect(pooled).toEqual([1, 2]);
    expect(pooled).not.toBe(values);
  });

  it("is empty for no values or no buckets", () => {
    expect(maxPool([], 4)).toEqual([]);
    expect(maxPool([1, 2, 3], 0)).toEqual([]);
  });
});
