import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";

describe("useToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17, 23, 58, 30));
  });

  it("starts at the current time", () => {
    const { result } = renderHook(() => useToday());

    expect(result.current).toEqual(new Date(2026, 8, 17, 23, 58, 30));
  });

  it("moves to the new day within a minute of local midnight", async () => {
    const { result } = renderHook(() => useToday());
    const first = result.current;

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    // Same day: no new value, so nothing re-renders.
    expect(result.current).toBe(first);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.getDate()).toBe(18);
    expect(result.current.getHours()).toBe(0);
  });

  it("catches up once timers run again after the device slept", async () => {
    const { result } = renderHook(() => useToday());

    // Sleep pauses timers while the wall clock moves on.
    vi.setSystemTime(new Date(2026, 8, 18, 8, 0));
    expect(result.current.getDate()).toBe(17);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.getDate()).toBe(18);
  });

  it("stops checking when unmounted", () => {
    const { unmount } = renderHook(() => useToday());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
