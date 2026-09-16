import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDayTime,
  formatDuration,
  formatRelative,
  formatShortTime,
  formatTimestamp,
} from "./time";

describe("formatTimestamp", () => {
  it.each([
    [0, "00:00"],
    [65.2, "01:05"],
    [75, "01:15"],
    [599.9, "09:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatTimestamp(seconds)).toBe(expected);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 s"],
    [42.4, "42 s"],
    [59.4, "59 s"],
    [59.6, "1 min"],
    [60, "1 min"],
    [125, "2 min"],
    [3569, "59 min"],
    [3570, "1 h"],
    [3600, "1 h"],
    [3900, "1 h 5 min"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [ago(10_000), "just now"],
    [ago(5 * 60_000), "5 minutes ago"],
    [ago(2 * 3_600_000), "2 hours ago"],
    [ago(26 * 3_600_000), "yesterday"],
    [ago(3 * 86_400_000), "3 days ago"],
    [new Date(now.getTime() + 30_000).toISOString(), "just now"],
  ])("%s → %s", (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });

  it("shows the date for anything older than a week", () => {
    expect(formatRelative("2026-09-01T12:00:00Z", now)).toBe("Sep 1, 2026");
  });
});

describe("formatDateTime", () => {
  it("shows the local date and time", () => {
    expect(formatDateTime(new Date(2026, 8, 16, 14, 5))).toMatch(
      /^Sep 16, 2026, 2:05\sPM$/,
    );
  });
});

describe("formatShortTime", () => {
  it.each([
    [0, "0:00"],
    [34.9, "0:34"],
    [70, "1:10"],
    [105.62, "1:45"],
    [599, "9:59"],
    [600, "10:00"],
    [3661, "1:01:01"],
    [-3, "0:00"],
    [Number.NaN, "0:00"],
    [Number.POSITIVE_INFINITY, "0:00"],
  ])("%s s → %s", (seconds, expected) => {
    expect(formatShortTime(seconds)).toBe(expected);
  });
});

describe("formatDayTime", () => {
  const now = new Date(2026, 8, 17, 9, 0);

  it("leaves out the year for dates in the current year", () => {
    expect(formatDayTime(new Date(2026, 8, 17, 14, 31), now)).toMatch(
      /^Sep 17, 2:31\sPM$/,
    );
  });

  it("shows the year for older dates", () => {
    expect(formatDayTime(new Date(2025, 11, 3, 9, 5), now)).toMatch(
      /^Dec 3, 2025, 9:05\sAM$/,
    );
  });
});
