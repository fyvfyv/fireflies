type ToastTone = "default" | "danger";
type ToastItem = {
  id: number;
  title: string;
  tone: ToastTone;
  leaving: boolean;
};
type ToastState = {
  toasts: readonly ToastItem[];
  offset: number | null;
};

export const TOAST_DURATION_MS = 3500;
const DANGER_TOAST_DURATION_MS = 10_000;
export const TOAST_EXIT_MS = 200;
const MAX_TOASTS = 3;

const emptyState: ToastState = { toasts: [], offset: null };

let state = emptyState;
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
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

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastState(): ToastState {
  return state;
}

export function toast({
  title,
  tone = "default",
}: {
  title: string;
  tone?: ToastTone;
}): number {
  const id = nextId++;
  const toasts = [...state.toasts, { id, title, tone, leaving: false }];
  for (const old of toasts.slice(0, -MAX_TOASTS)) forget(old.id);
  setState({ ...state, toasts: toasts.slice(-MAX_TOASTS) });
  scheduleDismiss(
    id,
    tone === "danger" ? DANGER_TOAST_DURATION_MS : TOAST_DURATION_MS,
  );
  return id;
}

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
    setTimeout(() => {
      timers.delete(id);
      setState({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
    }, TOAST_EXIT_MS),
  );
}

export function pauseToast(id: number): void {
  const deadline = deadlines.get(id);
  if (deadline === undefined || paused.has(id)) return;
  clearTimer(id);
  paused.set(id, Math.max(0, deadline - Date.now()));
}

export function resumeToast(id: number): void {
  const remaining = paused.get(id);
  if (remaining === undefined) return;
  paused.delete(id);
  scheduleDismiss(id, remaining);
}

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

export function resetToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  deadlines.clear();
  paused.clear();
  offsets.clear();
  if (state !== emptyState) setState(emptyState);
}
