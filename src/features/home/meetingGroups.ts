import type { MeetingListItem } from "@shared/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
const monthYear = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

// Built from local date parts, so 23/25-hour DST days count as one day.
const dayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;

// Calendar week starting Monday (ISO 8601), not the last seven days.
const weekStart = (now: Date) => dayNumber(now) - ((now.getDay() + 6) % 7);

function dayLabel(date: Date, now: Date): string {
  const day = dayNumber(date);
  const daysAgo = dayNumber(now) - day;
  // Future timestamps come from browser/server clock skew.
  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (day >= weekStart(now)) return "Earlier this week";
  return monthYear.format(date);
}

export function groupByDay(
  items: MeetingListItem[],
  now: Date,
): { label: string; items: MeetingListItem[] }[] {
  const groups = new Map<string, MeetingListItem[]>();
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

export function topicFor(id: string): TopicIndex {
  // FNV-1a: cheap, and spreads similar UUIDs well.
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (((hash >>> 0) % 6) + 1) as TopicIndex;
}
