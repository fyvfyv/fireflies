import type { Meeting } from "@shared/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, getMeeting } from "@/lib/api";

const FAST_POLL_MS = 2_000;
const SLOW_POLL_MS = 5_000;
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

const isProcessing = (m: Meeting) =>
  m.status !== "done" && m.status !== "failed" && !m.stalled;

export function useMeeting(id: string, { keepPolling = false } = {}) {
  const [state, setState] = useState(() => loading(id));
  if (state.id !== id) setState(loading(id));
  const pollingSince = useRef(0);

  const refetch = useCallback(async () => {
    let apply: (prev: MeetingState) => MeetingState;
    try {
      const meeting = await getMeeting(id);
      apply = (prev) => ({
        id,
        // Reuse unchanged objects so memoized views can skip the update.
        meeting: prev.meeting ? keepUnchanged(prev.meeting, meeting) : meeting,
        notFound: false,
        error: null,
      });
    } catch (err) {
      apply =
        err instanceof ApiError && err.status === 404
          ? () => ({ ...loading(id), notFound: true })
          : (prev) => ({ ...prev, error: errorMessage(err) });
    }
    // Drop responses for a meeting the page has navigated away from.
    setState((prev) => (prev.id === id ? apply(prev) : prev));
  }, [id]);

  useEffect(() => {
    pollingSince.current = Date.now();
    refetch();
  }, [refetch]);

  // Re-arms after each response (it replaces `state`), so requests never stack.
  useEffect(() => {
    if (!state.meeting) return;
    if (!keepPolling && !isProcessing(state.meeting)) return;
    const elapsed = Date.now() - pollingSince.current;
    const delay = elapsed < SLOW_POLL_AFTER_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    const timer = setTimeout(refetch, delay);
    return () => clearTimeout(timer);
  }, [state, refetch, keepPolling]);

  useEffect(() => {
    window.addEventListener("focus", refetch);
    return () => window.removeEventListener("focus", refetch);
  }, [refetch]);

  const { meeting, notFound, error } = state;
  return { meeting, notFound, error, refetch };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
