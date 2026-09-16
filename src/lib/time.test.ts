import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDayTime,
  formatDuration,
  formatShortTime,
  formatTimestamp,
} from "./time";

describe("formatTimestamp", () => {
  it.each([
    [0, "00:00"],
    [65.2, "01:05"],
    [3661, "1:01:01"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatTimestamp(seconds)).toBe(expected);
  });
});

describe("formatShortTime", () => {
  it.each([
    [34.9, "0:34"],
    [600, "10:00"],
    [3661, "1:01:01"],
    [-3, "0:00"],
    [Number.NaN, "0:00"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatShortTime(seconds)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [42.4, "42 s"],
    [59.6, "1 min"],
    [3570, "1 h"],
    [3900, "1 h 5 min"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatDateTime", () => {
  it("shows the local date and time", () => {
    expect(formatDateTime(new Date(2026, 8, 16, 14, 5))).toMatch(
      /^Sep 16, 2026, 2:05\sPM$/,
    );
  });
});

describe("formatDayTime", () => {
  const now = new Date(2026, 8, 17, 9, 0);

  it("shows the year only for other years", () => {
    expect(formatDayTime(new Date(2026, 8, 17, 14, 31), now)).toMatch(
      /^Sep 17, 2:31\sPM$/,
    );
    expect(formatDayTime(new Date(2025, 11, 3, 9, 5), now)).toMatch(
      /^Dec 3, 2025, 9:05\sAM$/,
    );
  });
});
