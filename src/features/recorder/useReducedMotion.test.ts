import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useReducedMotion } from "./useReducedMotion";

it("follows the reduced-motion preference until unmounted", () => {
  const query = {
    ...window.matchMedia(""),
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue(query);
  const { result, unmount } = renderHook(() => useReducedMotion());
  expect(result.current).toBe(false);
  expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");

  const onChange = query.addEventListener.mock.calls[0]?.[1];
  query.matches = true;
  act(() => onChange());
  expect(result.current).toBe(true);

  unmount();
  expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange);
});
