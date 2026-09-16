import type { MeetingListItem } from "@shared/schemas";
import { describe, expect, it } from "vitest";
import { meetingListItemFixture } from "@/test/fixtures";
import {
  filterMeetings,
  groupByDay,
  type MeetingGroup,
  rowTime,
  topicFor,
} from "./meetingGroups";

// Local times throughout, so the day boundaries hold in any time zone.
const at = (...parts: [number, number, number, number?, number?, number?]) =>
  new Date(...parts).toISOString();

const item = (id: string, createdAt: string) =>
  meetingListItemFixture({ id, createdAt });

const labelsOf = (groups: MeetingGroup<MeetingListItem>[]) =>
  groups.map((group) => [group.label, group.items.map((i) => i.id)]);

describe("groupByDay", () => {
  const now = new Date(2026, 8, 17, 9, 30);

  it("is empty without meetings", () => {
    expect(groupByDay([], now)).toEqual([]);
  });

  it("labels today, yesterday, the rest of the week, then months", () => {
    // `now` is a Thursday.
    const groups = groupByDay(
      [
        item("today", at(2026, 8, 17, 8, 0)),
        item("yesterday", at(2026, 8, 16, 15, 0)),
        item("tuesday", at(2026, 8, 15, 10, 0)),
        item("monday", at(2026, 8, 14, 0, 0)),
        item("last-sunday", at(2026, 8, 13, 23, 59)),
        item("last-friday", at(2026, 8, 11, 12, 0)),
        item("august", at(2026, 7, 31, 18, 0)),
        item("last-year", at(2025, 8, 20, 9, 0)),
      ],
      now,
    );

    expect(labelsOf(groups)).toEqual([
      ["Today", ["today"]],
      ["Yesterday", ["yesterday"]],
      ["Earlier this week", ["tuesday", "monday"]],
      ["September 2026", ["last-sunday", "last-friday"]],
      ["August 2026", ["august"]],
      ["September 2025", ["last-year"]],
    ]);
  });

  it("starts the week on Monday", () => {
    const monday = new Date(2026, 8, 14, 9, 0);

    const groups = groupByDay(
      [
        item("sunday", at(2026, 8, 13, 10, 0)),
        item("saturday", at(2026, 8, 12, 10, 0)),
      ],
      monday,
    );

    expect(labelsOf(groups)).toEqual([
      ["Yesterday", ["sunday"]],
      ["September 2026", ["saturday"]],
    ]);
  });

  it("has nothing earlier this week on a Tuesday", () => {
    const tuesday = new Date(2026, 8, 15, 9, 0);

    const groups = groupByDay(
      [
        item("monday", at(2026, 8, 14, 10, 0)),
        item("sunday", at(2026, 8, 13, 10, 0)),
      ],
      tuesday,
    );

    expect(labelsOf(groups)).toEqual([
      ["Yesterday", ["monday"]],
      ["September 2026", ["sunday"]],
    ]);
  });

  it("keeps a week that started last month together", () => {
    // Thursday October 1; the week began on Monday September 28.
    const thursday = new Date(2026, 9, 1, 9, 0);

    const groups = groupByDay(
      [
        item("monday", at(2026, 8, 28, 10, 0)),
        item("sunday", at(2026, 8, 27, 10, 0)),
      ],
      thursday,
    );

    expect(labelsOf(groups)).toEqual([
      ["Earlier this week", ["monday"]],
      ["September 2026", ["sunday"]],
    ]);
  });

  it("counts a Sunday as the end of its week", () => {
    const sunday = new Date(2026, 8, 20, 9, 0);

    const groups = groupByDay(
      [
        item("monday", at(2026, 8, 14, 10, 0)),
        item("last-sunday", at(2026, 8, 13, 10, 0)),
      ],
      sunday,
    );

    expect(labelsOf(groups)).toEqual([
      ["Earlier this week", ["monday"]],
      ["September 2026", ["last-sunday"]],
    ]);
  });

  it("splits days at local midnight", () => {
    const groups = groupByDay(
      [
        item("first-minute", at(2026, 8, 17, 0, 0, 0)),
        item("last-minute", at(2026, 8, 16, 23, 59, 59)),
        item("yesterday-start", at(2026, 8, 16, 0, 0, 0)),
        item("two-days", at(2026, 8, 15, 23, 59, 59)),
      ],
      now,
    );

    expect(labelsOf(groups)).toEqual([
      ["Today", ["first-minute"]],
      ["Yesterday", ["last-minute", "yesterday-start"]],
      ["Earlier this week", ["two-days"]],
    ]);
  });

  it("counts calendar days, not 24-hour spans", () => {
    const lateNight = new Date(2026, 8, 17, 0, 5);

    const groups = groupByDay(
      [item("an-hour-ago", at(2026, 8, 16, 23, 5))],
      lateNight,
    );

    expect(labelsOf(groups)).toEqual([["Yesterday", ["an-hour-ago"]]]);
  });

  it("files clock-skewed future meetings under today", () => {
    const groups = groupByDay([item("ahead", at(2026, 8, 18, 1, 0))], now);

    expect(labelsOf(groups)).toEqual([["Today", ["ahead"]]]);
  });

  it("keeps one group per label even when the input is out of order", () => {
    const groups = groupByDay(
      [
        item("a", at(2026, 8, 17, 8, 0)),
        item("b", at(2026, 8, 16, 8, 0)),
        item("c", at(2026, 8, 17, 7, 0)),
      ],
      now,
    );

    expect(labelsOf(groups)).toEqual([
      ["Today", ["a", "c"]],
      ["Yesterday", ["b"]],
    ]);
  });
});

describe("filterMeetings", () => {
  const meetings = [
    meetingListItemFixture({
      id: "sync",
      title: "Weekly sync",
      overviewSnippet: "The team agreed to ship on Friday.",
    }),
    meetingListItemFixture({
      id: "pricing",
      title: "Pricing review",
      overviewSnippet: null,
    }),
  ];
  const ids = (query: string) =>
    filterMeetings(meetings, query).map((m) => m.id);

  it("returns every meeting for a blank query", () => {
    expect(filterMeetings(meetings, "")).toBe(meetings);
    expect(filterMeetings(meetings, "   ")).toBe(meetings);
  });

  it("matches titles and snippets, ignoring case", () => {
    expect(ids("PRICING")).toEqual(["pricing"]);
    expect(ids("friday")).toEqual(["sync"]);
    expect(ids("e")).toEqual(["sync", "pricing"]);
  });

  it("ignores surrounding spaces", () => {
    expect(ids("  weekly ")).toEqual(["sync"]);
  });

  it("finds nothing when nothing matches", () => {
    expect(ids("roadmap")).toEqual([]);
  });
});

describe("topicFor", () => {
  it("picks the same topic color for the same meeting", () => {
    expect(topicFor("e21c9013-bb9f")).toBe(topicFor("e21c9013-bb9f"));
  });

  it("spreads meetings over the six topic colors", () => {
    const topics = new Set(
      Array.from({ length: 60 }, (_, i) => topicFor(`meeting-${i}`)),
    );

    expect([...topics].every((topic) => topic >= 1 && topic <= 6)).toBe(true);
    expect(topics.size).toBe(6);
  });
});

describe("rowTime", () => {
  const now = new Date(2026, 8, 17, 16, 0);
  // Newer ICU versions put a narrow no-break space before AM/PM.
  const plain = (text: string) => text.replace(/\s/g, " ");

  it("shows the time for a meeting from today", () => {
    expect(plain(rowTime(at(2026, 8, 17, 14, 31), now))).toBe("2:31 PM");
  });

  it("shows the date for earlier days this year", () => {
    expect(rowTime(at(2026, 8, 16, 23, 0), now)).toBe("Sep 16");
    expect(rowTime(at(2026, 0, 2, 9, 0), now)).toBe("Jan 2");
  });

  it("adds the year for older meetings", () => {
    expect(rowTime(at(2025, 11, 31, 9, 0), now)).toBe("Dec 31, 2025");
  });
});
