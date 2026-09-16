import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetToasts } from "@/components/ui/toastStore";

// jsdom does not implement object URLs; recorder and download flows need them.
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => "blob:mock"),
  writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  writable: true,
});

// Shared browser stubs for APIs jsdom lacks (radix measures elements and
// captures pointers; the player and waveform touch media and canvas). Plain
// functions rather than vi.fn(), so the mock resets below never strip them;
// tests that need other behavior override them with vi.spyOn/vi.stubGlobal.
function stub(target: object, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
  });
}

if (typeof window.ResizeObserver !== "function") {
  stub(
    window,
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

// Checked by type: the jsdom environment can leave the key defined but empty.
if (typeof window.matchMedia !== "function") {
  // No reduced motion, and every width query false: tests see the narrow
  // layout unless they opt into a wider one.
  stub(window, "matchMedia", (media: string): MediaQueryList => {
    const noop = () => {};
    return {
      matches: false,
      media,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    };
  });
}

if (typeof Element.prototype.scrollIntoView !== "function") {
  stub(Element.prototype, "scrollIntoView", () => {});
}

if (typeof Element.prototype.hasPointerCapture !== "function") {
  stub(Element.prototype, "hasPointerCapture", () => false);
  stub(Element.prototype, "setPointerCapture", () => {});
  stub(Element.prototype, "releasePointerCapture", () => {});
}

// jsdom defines these but only reports "not implemented" (and play() returns
// no promise), so they are replaced unconditionally.
stub(HTMLMediaElement.prototype, "play", () => Promise.resolve());
stub(HTMLMediaElement.prototype, "pause", () => {});
stub(HTMLMediaElement.prototype, "load", () => {});
stub(HTMLCanvasElement.prototype, "getContext", () => null);
// The layout's <ScrollRestoration> scrolls on every navigation.
stub(window, "scrollTo", () => {});

afterEach(() => {
  cleanup();
  // Toasts live in a module-level store; without this they leak between tests.
  resetToasts();
  vi.useRealTimers();
  // restoreAllMocks only restores spies; call history of plain vi.fn() mocks
  // (like the object URL stubs above) would otherwise leak between tests.
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
