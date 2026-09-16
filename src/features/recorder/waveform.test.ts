import { describe, expect, it } from "vitest";
import {
  barCountFor,
  layoutBars,
  levelFromSamples,
  maxPool,
  smoothLevel,
} from "./waveform";

describe("barCountFor", () => {
  it("fits one bar per 6px, between 40 and 64 bars", () => {
    expect(barCountFor(300)).toBe(50);
    expect(barCountFor(0)).toBe(40);
    expect(barCountFor(1000)).toBe(64);
  });
});

describe("levelFromSamples", () => {
  const at = (db: number) =>
    levelFromSamples(new Float32Array(64).fill(10 ** (db / 20)));

  it("keeps room noise flat and spreads speech over the height", () => {
    expect(levelFromSamples(new Float32Array(64))).toBe(0);
    expect(levelFromSamples([])).toBe(0);
    expect(at(-70)).toBe(0);
    expect(at(-40)).toBeLessThan(0.3);
    expect(at(-30)).toBeGreaterThan(0.4);
    expect(at(-30)).toBeLessThan(0.5);
    expect(at(-15)).toBeGreaterThan(0.8);
    expect(at(0)).toBe(1);
  });

  it("uses the RMS of positive and negative samples alike", () => {
    const wave = Float32Array.from({ length: 64 }, (_, i) =>
      i % 2 ? 0.1 : -0.1,
    );
    expect(levelFromSamples(wave)).toBeCloseTo(at(-20));
  });
});

describe("smoothLevel", () => {
  it("rises faster than it falls, but a short pause still shows", () => {
    expect(smoothLevel(0, 1)).toBeGreaterThan(1 - smoothLevel(1, 0));

    let level = 1;
    for (let i = 0; i < 9; i++) level = smoothLevel(level, 0);
    expect(level).toBeLessThan(0.1);
  });
});

describe("layoutBars", () => {
  const size = { width: 240, height: 48, progress: 0 };

  it("draws the newest levels at the right edge over a row of dots", () => {
    const bars = layoutBars({ ...size, levels: [0.5, 2] });

    expect(bars).toHaveLength(40);
    expect(bars[0]).toEqual({ x: 1.5, y: 22.5, width: 3, height: 3 });
    expect(bars.at(-3)).toMatchObject({ height: 3 });
    expect(bars.at(-2)).toMatchObject({ x: 229.5, y: 12, height: 24 });
    expect(bars.at(-1)).toMatchObject({ x: 235.5, y: 0, height: 48 });
  });

  it("slides the row left while the next level builds up", () => {
    const bars = layoutBars({ ...size, levels: [1], progress: 0.5 });

    expect(bars.at(-1)?.x).toBe(232.5);
    expect(bars).toHaveLength(40);
    expect(bars[0]?.x).toBe(-1.5);
  });

  it("only draws the levels that fit", () => {
    const levels = Array.from({ length: 100 }, (_, i) => (i < 59 ? 1 : 0));

    const bars = layoutBars({ ...size, levels });

    expect(bars.every((bar) => bar.height === 3)).toBe(true);
  });
});

describe("maxPool", () => {
  it("keeps the loudest value of each bucket, covering every value", () => {
    expect(maxPool([1, 5, 2, 8, 3, 4], 3)).toEqual([5, 8, 4]);
    expect(maxPool([9, 0, 0, 0, 0, 0, 7], 3)).toEqual([9, 0, 7]);
  });

  it("keeps every value when there is room for them", () => {
    expect(maxPool([1, 2], 5)).toEqual([1, 2]);
    expect(maxPool([], 4)).toEqual([]);
  });
});
