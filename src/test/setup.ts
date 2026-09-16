import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom does not implement object URLs; recorder and download flows need them.
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => "blob:mock"),
  writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  writable: true,
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // restoreAllMocks only restores spies; call history of plain vi.fn() mocks
  // (like the object URL stubs above) would otherwise leak between tests.
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
