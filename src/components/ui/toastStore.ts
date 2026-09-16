// A module-level store (rather than React context) so any component can raise
// a toast without a provider in its tree; <Toaster> only renders the store.

export type ToastTone = "default" | "danger";
export type ToastInput = { title: string; tone?: ToastTone };
export type ToastItem = {
  id: number;
  title: string;
  tone: ToastTone;
  leaving: boolean;
};
export type ToastState = {
  toasts: readonly ToastItem[];
  /** Bottom lift requested by a mounted page, e.g. above a player bar. */
  offset: number | null;
};

export const TOAST_DURATION_MS = 3500;
/** An error needs reading and often acting on, not just noticing. */
export const DANGER_TOAST_DURATION_MS = 10_000;
export const TOAST_EXIT_MS = 200;
export const MAX_TOASTS = 3;

const emptyState: ToastState = { toasts: [], offset: null };

let state = emptyState;
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
// When each visible toast is due to leave (epoch ms), and how long a paused
// one has left, so a resumed countdown continues instead of starting over.
const deadlines = new Map<number, number>();
const paused = new Map<number, number>();
const offsets = new Map<symbol, number>();

function setState(next: ToastState) {
  state = next;
  for (const listener of listeners) listener();
}

function clearTimer(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Stops a toast's countdown for good (it is leaving or gone). */
function forget(id: number) {
  clearTimer(id);
  deadlines.delete(id);
  paused.delete(id);
}

function scheduleDismiss(id: number, ms: number) {
  deadlines.set(id, Date.now() + ms);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
}

function remove(id: number) {
  forget(id);
  setState({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastState(): ToastState {
  return state;
}

export function toast({ title, tone = "default" }: ToastInput): number {
  const id = nextId++;
  const toasts = [...state.toasts, { id, title, tone, leaving: false }];
  const dropped = toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS));
  for (const old of dropped) forget(old.id);
  setState({ ...state, toasts: toasts.slice(-MAX_TOASTS) });
  scheduleDismiss(
    id,
    tone === "danger" ? DANGER_TOAST_DURATION_MS : TOAST_DURATION_MS,
  );
  return id;
}

/** Starts the exit animation, then removes the toast. */
export function dismissToast(id: number): void {
  const target = state.toasts.find((t) => t.id === id);
  if (!target || target.leaving) return;
  forget(id);
  setState({
    ...state,
    toasts: state.toasts.map((t) =>
      t.id === id ? { ...t, leaving: true } : t,
    ),
  });
  timers.set(
    id,
    setTimeout(() => remove(id), TOAST_EXIT_MS),
  );
}

/**
 * Holds a toast's countdown while someone points at or focuses it, so it
 * can't vanish mid-read or from under the pointer (WCAG 2.2.1).
 */
export function pauseToast(id: number): void {
  const target = state.toasts.find((t) => t.id === id);
  const deadline = deadlines.get(id);
  if (!target || target.leaving || paused.has(id) || deadline === undefined) {
    return;
  }
  clearTimer(id);
  paused.set(id, Math.max(0, deadline - Date.now()));
}

/** Continues a paused countdown with the time it had left. */
export function resumeToast(id: number): void {
  const remaining = paused.get(id);
  if (remaining === undefined) return;
  paused.delete(id);
  scheduleDismiss(id, remaining);
}

/** Registers a bottom lift; returns the function that withdraws it. */
export function liftToasts(offset: number): () => void {
  const key = Symbol("toast-offset");
  offsets.set(key, offset);
  syncOffset();
  return () => {
    offsets.delete(key);
    syncOffset();
  };
}

function syncOffset() {
  const offset = offsets.size > 0 ? Math.max(...offsets.values()) : null;
  if (offset !== state.offset) setState({ ...state, offset });
}

/** Test helper: forgets every toast, timer and lift. */
export function resetToasts(): void {
  for (const id of timers.keys()) clearTimer(id);
  deadlines.clear();
  paused.clear();
  offsets.clear();
  if (state !== emptyState) setState(emptyState);
}
