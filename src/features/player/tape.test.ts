import { describe, expect, it } from "vitest";
import { percentOf, spanAt, tapeSpans } from "./tape";

const section = (heading: string, startSecond: number | null) => ({
  heading,
  startSecond,
});

describe("tapeSpans", () => {
  it("runs each section to the next one and the last to the end", () => {
    expect(tapeSpans([section("Intro", 0), section("Tasks", 70)], 125)).toEqual(
      [
        { index: 0, heading: "Intro", start: 0, end: 70 },
        { index: 1, heading: "Tasks", start: 70, end: 125 },
      ],
    );
  });

  it("orders sections by time and skips those without a moment", () => {
    expect(
      tapeSpans(
        [section("Later", 50), section("Unknown", null), section("First", 10)],
        100,
      ),
    ).toEqual([
      { index: 2, heading: "First", start: 10, end: 50 },
      { index: 0, heading: "Later", start: 50, end: 100 },
    ]);
  });

  it("clamps moments to the recording and drops empty spans", () => {
    expect(
      tapeSpans(
        [
          section("Before", -5),
          section("Same", 20),
          section("Twin", 20),
          section("After", 400),
        ],
        60,
      ),
    ).toEqual([
      { index: 0, heading: "Before", start: 0, end: 20 },
      { index: 2, heading: "Twin", start: 20, end: 60 },
    ]);
  });

  it.each([0, Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "draws nothing for a duration of %s",
    (duration) => {
      expect(tapeSpans([section("Intro", 0)], duration)).toEqual([]);
    },
  );
});

describe("spanAt", () => {
  const spans = tapeSpans([section("Intro", 5), section("Tasks", 70)], 125);

  it.each([
    [0, undefined],
    [5, "Intro"],
    [69.9, "Intro"],
    [70, "Tasks"],
    [125, "Tasks"],
  ])("%s s → %s", (seconds, heading) => {
    expect(spanAt(spans, seconds)?.heading).toBe(heading);
  });
});

describe("percentOf", () => {
  it.each([
    [0, 100, 0],
    [25, 100, 25],
    [150, 100, 100],
    [-3, 100, 0],
    [10, 0, 0],
  ])("%s of %s → %s%%", (seconds, duration, expected) => {
    expect(percentOf(seconds, duration)).toBe(expected);
  });
});
