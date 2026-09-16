import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetToasts } from "@/components/ui/toastStore";

// Plain functions where possible, not vi.fn(), so the resets below keep them.
function stub(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
  });
}

const noop = () => {};

stub(
  URL,
  "createObjectURL",
  vi.fn(() => "blob:mock"),
);
stub(URL, "revokeObjectURL", vi.fn());
stub(
  window,
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
stub(
  window,
  "matchMedia",
  (media: string): MediaQueryList => ({
    matches: false,
    media,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }),
);
stub(window, "scrollTo", noop);
stub(Element.prototype, "scrollIntoView", noop);
stub(Element.prototype, "hasPointerCapture", () => false);
stub(Element.prototype, "setPointerCapture", noop);
stub(Element.prototype, "releasePointerCapture", noop);
stub(HTMLMediaElement.prototype, "play", () => Promise.resolve());
stub(HTMLMediaElement.prototype, "pause", noop);
stub(HTMLMediaElement.prototype, "load", noop);
stub(HTMLCanvasElement.prototype, "getContext", () => null);

afterEach(() => {
  cleanup();
  resetToasts();
  vi.useRealTimers();
  // restoreAllMocks only restores spies; clearAllMocks also resets plain vi.fn() stubs.
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
