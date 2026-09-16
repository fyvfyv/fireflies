import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";

describe("useToday", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 8, 17, 23, 58, 30) });
  });

  it("moves to the new day within a minute of local midnight", async () => {
    const { result, unmount } = renderHook(() => useToday());
    const first = result.current;

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current).toBe(first);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current).toEqual(new Date(2026, 8, 18, 0, 0, 30));

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("catches up once timers run again after the device slept", async () => {
    const { result } = renderHook(() => useToday());

    vi.setSystemTime(new Date(2026, 8, 18, 8, 0));
    expect(result.current.getDate()).toBe(17);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.getDate()).toBe(18);
  });
});
