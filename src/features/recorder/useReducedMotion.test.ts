import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "./useReducedMotion";

function stubMotionQuery(initial: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  const matchMedia = vi
    .spyOn(window, "matchMedia")
    .mockReturnValue(query as unknown as MediaQueryList);
  return {
    matchMedia,
    listeners,
    change(matches: boolean) {
      query.matches = matches;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

describe("useReducedMotion", () => {
  it("is false by default", () => {
    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(false);
  });

  it("reads the user's preference", () => {
    const motion = stubMotionQuery(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    expect(motion.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it("follows changes and stops listening on unmount", () => {
    const motion = stubMotionQuery(false);
    const { result, unmount } = renderHook(() => useReducedMotion());

    motion.change(true);
    expect(result.current).toBe(true);

    unmount();
    expect(motion.listeners.size).toBe(0);
  });
});
