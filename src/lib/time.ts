const pad = (n: number) => String(n).padStart(2, "0");

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * `m:ss` without a padded minute ("1:10"), the way times are read aloud and
 * written in labels such as "Play from 1:10".
 */
export function formatShortTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Units are picked after rounding, so 59.6 s reads "1 min", not "60 s".
export function formatDuration(seconds: number): string {
  if (Math.round(seconds) < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

const dayTime = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dayTimeWithYear = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sep 17, 2:31 PM"; the year only appears when it isn't the current one. */
export function formatDayTime(value: Date, now = new Date()): string {
  return value.getFullYear() === now.getFullYear()
    ? dayTime.format(value)
    : dayTimeWithYear.format(value);
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(iso: string, now = new Date()): string {
  const then = new Date(iso);
  // Future timestamps only come from clock skew between browser and server.
  const ago = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return relative.format(-Math.floor(ago / MINUTE), "minute");
  if (ago < DAY) return relative.format(-Math.floor(ago / HOUR), "hour");
  if (ago < 7 * DAY) return relative.format(-Math.floor(ago / DAY), "day");
  return date.format(then);
}
