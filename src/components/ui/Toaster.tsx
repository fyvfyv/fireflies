import { tw } from "@tw";
import { CircleAlert, X } from "lucide-react";
import {
  type CSSProperties,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  dismissToast,
  getToastState,
  liftToasts,
  pauseToast,
  resumeToast,
  subscribeToasts,
  toast,
} from "./toastStore";

export type { ToastInput, ToastTone } from "./toastStore";
export { dismissToast, toast } from "./toastStore";

const toastApi = { toast, dismiss: dismissToast };

/** `toast({ title, tone })` shows a notification in the app's Toaster. */
export function useToast() {
  return toastApi;
}

/**
 * Lifts toasts by `offset` px while the calling component is mounted, so they
 * clear bottom-docked UI such as the player bar.
 */
export function useToastOffset(offset: number) {
  useEffect(() => liftToasts(offset), [offset]);
}

type ToasterProps = {
  /** Default bottom lift in px when no mounted page asks for one. */
  offset?: number;
};

export function Toaster({ offset = 0 }: ToasterProps) {
  const { toasts, offset: lifted } = useSyncExternalStore(
    subscribeToasts,
    getToastState,
    getToastState,
  );
  // Toasts under the pointer, so losing focus doesn't restart a hovered
  // toast's countdown. Held weakly: a toast can unmount while hovered.
  const hovered = useRef(new WeakSet<Element>());
  const style = { "--toast-offset": `${lifted ?? offset}px` } as CSSProperties;

  return (
    // Always rendered: screen readers only announce changes to a live region
    // that already exists.
    <section
      aria-label="Notifications"
      aria-live="polite"
      style={style}
      className={tw(
        "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4",
        "bottom-[calc(var(--toast-offset)_+_1rem_+_env(safe-area-inset-bottom,0px))]",
      )}
    >
      {toasts.map((item) => (
        // Pointing at or focusing a toast holds its countdown, so it can't
        // vanish mid-read. The dismiss button stays the only control.
        // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only pause the auto-dismiss timer
        <div
          key={item.id}
          data-tone={item.tone}
          onPointerEnter={(event) => {
            hovered.current.add(event.currentTarget);
            pauseToast(item.id);
          }}
          onPointerLeave={(event) => {
            hovered.current.delete(event.currentTarget);
            // A focused dismiss button still holds the toast.
            if (!event.currentTarget.contains(document.activeElement)) {
              resumeToast(item.id);
            }
          }}
          onFocus={() => pauseToast(item.id)}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (
              !event.currentTarget.contains(next) &&
              !hovered.current.has(event.currentTarget)
            ) {
              resumeToast(item.id);
            }
          }}
          className={tw(
            "pointer-events-auto flex w-max max-w-full items-center gap-2 rounded-control py-1.5 pr-1.5 pl-3.5 text-small shadow-float sm:max-w-md",
            item.tone === "danger"
              ? "bg-danger text-sheet"
              : "bg-ink text-sheet",
            item.leaving ? "animate-toast-out" : "animate-toast-in",
          )}
        >
          {item.tone === "danger" && (
            <CircleAlert aria-hidden="true" size={16} strokeWidth={1.75} />
          )}
          <p className={tw("min-w-0 flex-1 py-1")}>{item.title}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismissToast(item.id)}
            className={tw(
              "grid size-7 shrink-0 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100",
              "focus-visible:outline-sheet",
            )}
          >
            <X aria-hidden="true" size={14} strokeWidth={1.75} />
          </button>
        </div>
      ))}
    </section>
  );
}
