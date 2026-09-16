import type { Meeting } from "@shared/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, getMeeting } from "@/lib/api";

const FAST_POLL_MS = 2_000;
const SLOW_POLL_MS = 5_000;
// Short recordings finish within a minute; longer ones don't need 2 s updates.
const SLOW_POLL_AFTER_MS = 60_000;

type MeetingState = {
  id: string;
  meeting: Meeting | null;
  notFound: boolean;
  error: string | null;
};

const loading = (id: string): MeetingState => ({
  id,
  meeting: null,
  notFound: false,
  error: null,
});

// A stalled run will not progress on its own, so polling it only burns requests.
const isProcessing = (m: Meeting) =>
  m.status !== "done" && m.status !== "failed" && !m.stalled;

type UseMeetingOptions = {
  // Polls even a failed or stalled meeting, e.g. while a retry request runs
  // and the row is about to move again.
  keepPolling?: boolean;
};

export function useMeeting(
  id: string,
  { keepPolling = false }: UseMeetingOptions = {},
) {
  const [state, setState] = useState(() => loading(id));
  if (state.id !== id) setState(loading(id));
  const pollingSince = useRef(0);

  const refetch = useCallback(async () => {
    let apply: (prev: MeetingState) => MeetingState;
    try {
      const meeting = await getMeeting(id);
      apply = (prev) => ({
        id,
        // Polls mostly return what the page already shows; keeping those
        // objects lets memoized views (the transcript) skip the update.
        meeting: prev.meeting ? keepUnchanged(prev.meeting, meeting) : meeting,
        notFound: false,
        error: null,
      });
    } catch (err) {
      apply =
        err instanceof ApiError && err.status === 404
          ? () => ({ ...loading(id), notFound: true })
          : // Keep the last meeting on screen; a failed poll is usually transient.
            (prev) => ({ ...prev, error: errorMessage(err) });
    }
    // Drop responses for a meeting the page has since navigated away from.
    setState((prev) => (prev.id === id ? apply(prev) : prev));
  }, [id]);

  useEffect(() => {
    pollingSince.current = Date.now();
    refetch();
  }, [refetch]);

  // Every response replaces `state`, so this re-arms after each one and never
  // stacks requests behind a slow response.
  useEffect(() => {
    if (!state.meeting) return;
    if (!keepPolling && !isProcessing(state.meeting)) return;
    const elapsed = Date.now() - pollingSince.current;
    const delay = elapsed < SLOW_POLL_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    const timer = setTimeout(refetch, delay);
    return () => clearTimeout(timer);
  }, [state, refetch, keepPolling]);

  useEffect(() => {
    const onFocus = () => {
      refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  const { meeting, notFound, error } = state;
  return { meeting, notFound, error, refetch };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Returns `next`, reusing every part of `prev` that is deeply equal to it
 * (all of `prev` when nothing changed). Values are parsed JSON.
 */
export function keepUnchanged<T>(prev: T, next: T): T {
  if (Object.is(prev, next)) return prev;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const merged = next.map((item, index) => {
      const kept = keepUnchanged(prev[index], item);
      if (kept !== prev[index]) same = false;
      return kept;
    });
    return (same ? prev : merged) as T;
  }
  if (isRecord(prev) && isRecord(next)) {
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(prev).length;
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const kept = keepUnchanged(prev[key], next[key]);
      if (kept !== prev[key] || !Object.hasOwn(prev, key)) same = false;
      merged[key] = kept;
    }
    return (same ? prev : merged) as T;
  }
  return next;
}
