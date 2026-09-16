import type { ActionItem } from "@shared/schemas";
import { useCallback, useSyncExternalStore } from "react";

export type OwnerGroup = {
  /** null collects the unassigned items. */
  owner: string | null;
  entries: { item: ActionItem; index: number }[];
};

/**
 * Named owners alphabetically, then "Unassigned". Owners are matched without
 * case because the model is not consistent about capitalising names.
 */
export function groupByOwner(items: readonly ActionItem[]): OwnerGroup[] {
  const named = new Map<string, OwnerGroup>();
  const unassigned: OwnerGroup = { owner: null, entries: [] };
  items.forEach((item, index) => {
    const owner = item.owner?.trim();
    if (!owner) {
      unassigned.entries.push({ item, index });
      return;
    }
    const key = owner.toLocaleLowerCase();
    const group = named.get(key) ?? { owner, entries: [] };
    group.entries.push({ item, index });
    named.set(key, group);
  });
  const groups = [...named.values()].sort((a, b) =>
    (a.owner ?? "").localeCompare(b.owner ?? "", "en", { sensitivity: "base" }),
  );
  if (unassigned.entries.length > 0) groups.push(unassigned);
  return groups;
}

/**
 * Identifies an item for its checkbox. The task text is part of the key, so
 * regenerated notes don't show old checks on different tasks.
 */
export function actionItemKey(item: ActionItem, index: number): string {
  return `${index}:${item.task}`;
}

// Checked items live in localStorage per meeting. A module-level cache keeps
// the notes tab and the action items tab in step without a provider; it is
// keyed by the stored string, so writes from elsewhere are picked up and an
// unchanged value keeps the same snapshot.
const EMPTY: ReadonlySet<string> = new Set();
type Entry = { raw: string | null; done: ReadonlySet<string> };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

const storageKey = (meetingId: string) => `recap:done:${meetingId}`;

function readRaw(meetingId: string): string | null {
  try {
    return localStorage.getItem(storageKey(meetingId));
  } catch {
    return null;
  }
}

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key) => typeof key === "string"))
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function read(meetingId: string): ReadonlySet<string> {
  const raw = readRaw(meetingId);
  const cached = cache.get(meetingId);
  if (cached && cached.raw === raw) return cached.done;
  const done = parse(raw);
  cache.set(meetingId, { raw, done });
  return done;
}

function write(meetingId: string, done: ReadonlySet<string>) {
  const raw = JSON.stringify([...done]);
  try {
    localStorage.setItem(storageKey(meetingId), raw);
    cache.set(meetingId, { raw, done });
  } catch {
    // Storage is full or blocked: keep the checks for this session by caching
    // them against the value that is still stored.
    cache.set(meetingId, { raw: readRaw(meetingId), done });
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab checked an item.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith("recap:done:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDoneItems(meetingId: string) {
  const done = useSyncExternalStore(
    subscribe,
    () => read(meetingId),
    () => EMPTY,
  );
  const toggle = useCallback(
    (key: string) => {
      const next = new Set(read(meetingId));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      write(meetingId, next);
    },
    [meetingId],
  );
  const isDone = useCallback((key: string) => done.has(key), [done]);
  return { isDone, toggle };
}
