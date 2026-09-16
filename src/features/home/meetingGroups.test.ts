import { describe, expect, it } from "vitest";
import { meetingListItemFixture } from "@/test/fixtures";
import { filterMeetings, groupByDay, rowTime, topicFor } from "./meetingGroups";

const at = (...parts: [number, number, number, number?, number?, number?]) =>
  new Date(...parts).toISOString();

const labels = (now: Date, items: [string, string][]) =>
  groupByDay(
    items.map(([id, createdAt]) => meetingListItemFixture({ id, createdAt })),
    now,
  ).map((group) => [group.label, group.items.map((item) => item.id)]);

describe("groupByDay", () => {
  const now = new Date(2026, 8, 17, 9, 30);

  it("labels today, yesterday, the rest of the week, then months", () => {
    expect(
      labels(now, [
        ["today", at(2026, 8, 17, 8, 0)],
        ["yesterday", at(2026, 8, 16, 15, 0)],
        ["tuesday", at(2026, 8, 15, 10, 0)],
        ["monday", at(2026, 8, 14, 0, 0)],
        ["last-sunday", at(2026, 8, 13, 23, 59)],
        ["august", at(2026, 7, 31, 18, 0)],
        ["last-year", at(2025, 8, 20, 9, 0)],
        ["also-today", at(2026, 8, 17, 7, 0)],
      ]),
    ).toEqual([
      ["Today", ["today", "also-today"]],
      ["Yesterday", ["yesterday"]],
      ["Earlier this week", ["tuesday", "monday"]],
      ["September 2026", ["last-sunday"]],
      ["August 2026", ["august"]],
      ["September 2025", ["last-year"]],
    ]);
  });

  it("splits days at local midnight, not 24 hours back", () => {
    expect(
      labels(new Date(2026, 8, 17, 0, 5), [
        ["first-second", at(2026, 8, 17, 0, 0, 0)],
        ["an-hour-ago", at(2026, 8, 16, 23, 5)],
        ["yesterday-start", at(2026, 8, 16, 0, 0, 0)],
        ["two-days", at(2026, 8, 15, 23, 59, 59)],
      ]),
    ).toEqual([
      ["Today", ["first-second"]],
      ["Yesterday", ["an-hour-ago", "yesterday-start"]],
      ["Earlier this week", ["two-days"]],
    ]);
  });

  it("runs the week from Monday to Sunday, across month ends", () => {
    const monday = new Date(2026, 8, 14, 9, 0);
    expect(
      labels(monday, [
        ["sunday", at(2026, 8, 13, 10, 0)],
        ["saturday", at(2026, 8, 12, 10, 0)],
      ]),
    ).toEqual([
      ["Yesterday", ["sunday"]],
      ["September 2026", ["saturday"]],
    ]);

    const sunday = new Date(2026, 8, 20, 9, 0);
    expect(
      labels(sunday, [
        ["monday", at(2026, 8, 14, 10, 0)],
        ["last-sunday", at(2026, 8, 13, 10, 0)],
      ]),
    ).toEqual([
      ["Earlier this week", ["monday"]],
      ["September 2026", ["last-sunday"]],
    ]);

    const thursday = new Date(2026, 9, 1, 9, 0);
    expect(labels(thursday, [["monday", at(2026, 8, 28, 10, 0)]])).toEqual([
      ["Earlier this week", ["monday"]],
    ]);
  });

  it("files clock-skewed future meetings under today", () => {
    expect(labels(now, [["ahead", at(2026, 8, 18, 1, 0)]])).toEqual([
      ["Today", ["ahead"]],
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

  it("matches titles and snippets, ignoring case and surrounding spaces", () => {
    expect(ids("PRICING")).toEqual(["pricing"]);
    expect(ids("  friday ")).toEqual(["sync"]);
    expect(ids("e")).toEqual(["sync", "pricing"]);
    expect(ids("roadmap")).toEqual([]);
  });

  it("returns every meeting for a blank query", () => {
    expect(filterMeetings(meetings, "   ")).toBe(meetings);
  });
});

describe("topicFor", () => {
  it("spreads meetings over six stable topic colors", () => {
    const topics = Array.from({ length: 60 }, (_, i) => topicFor(`m-${i}`));

    expect(topicFor("m-7")).toBe(topics[7]);
    expect(new Set(topics)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });
});

describe("rowTime", () => {
  it("shows the time for today, the date before, and the year before that", () => {
    const now = new Date(2026, 8, 17, 16, 0);
    // Newer ICU versions put a narrow no-break space before AM/PM.
    expect(rowTime(at(2026, 8, 17, 14, 31), now).replace(/\s/g, " ")).toBe(
      "2:31 PM",
    );
    expect(rowTime(at(2026, 8, 16, 23, 0), now)).toBe("Sep 16");
    expect(rowTime(at(2026, 0, 2, 9, 0), now)).toBe("Jan 2");
    expect(rowTime(at(2025, 11, 31, 9, 0), now)).toBe("Dec 31, 2025");
  });
});
