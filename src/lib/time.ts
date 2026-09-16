const pad = (n: number) => String(n).padStart(2, "0");

function clockParts(seconds: number) {
  const total = Math.floor(seconds);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function formatTimestamp(seconds: number): string {
  const { h, m, s } = clockParts(seconds);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatShortTime(seconds: number): string {
  // Media elements report NaN or Infinity until the duration is known.
  const { h, m, s } = clockParts(
    Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
  );
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatDuration(seconds: number): string {
  if (Math.round(seconds) < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});
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

export function formatDateTime(value: Date): string {
  return dateTime.format(value);
}

export function formatDayTime(value: Date, now = new Date()): string {
  return value.getFullYear() === now.getFullYear()
    ? dayTime.format(value)
    : dayTimeWithYear.format(value);
}
