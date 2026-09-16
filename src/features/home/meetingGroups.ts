import type { MeetingListItem } from "@shared/schemas";

export type MeetingGroup<T> = { label: string; items: T[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const monthYear = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

// A local calendar date as a day count. Built from the local date parts, so
// DST days (23 or 25 hours long) still count as one day.
const dayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;

// "This week" is the calendar week, not the last seven days: on a Monday,
// last Friday is not "this week". Weeks start on Monday (ISO 8601).
const weekStart = (now: Date) => dayNumber(now) - ((now.getDay() + 6) % 7);

function dayLabel(date: Date, now: Date): string {
  const day = dayNumber(date);
  const daysAgo = dayNumber(now) - day;
  // Future timestamps only come from clock skew between browser and server.
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (day >= weekStart(now)) return "Earlier this week";
  return monthYear.format(date);
}

/**
 * Groups by the viewer's local day. Groups keep the order in which they first
 * appear, so a newest-first list stays newest-first.
 */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date,
): MeetingGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = dayLabel(new Date(item.createdAt), now);
    const group = groups.get(label);
    if (group) group.push(item);
    else groups.set(label, [item]);
  }
  return Array.from(groups, ([label, grouped]) => ({ label, items: grouped }));
}

const time = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
});
const monthDay = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});
const fullDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** The list's time column: a time for today's meetings, otherwise a date. */
export function rowTime(iso: string, now: Date): string {
  const date = new Date(iso);
  if (dayNumber(date) >= dayNumber(now)) return time.format(date);
  if (date.getFullYear() === now.getFullYear()) return monthDay.format(date);
  return fullDate.format(date);
}

export function filterMeetings(
  items: MeetingListItem[],
  query: string,
): MeetingListItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) ||
      (item.overviewSnippet?.toLowerCase().includes(needle) ?? false),
  );
}

export type TopicIndex = 1 | 2 | 3 | 4 | 5 | 6;

/** A stable topic color per meeting, so a row keeps its swatch across visits. */
export function topicFor(id: string): TopicIndex {
  // FNV-1a: cheap, and spreads similar ids (UUIDs) well.
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (((hash >>> 0) % 6) + 1) as TopicIndex;
}
