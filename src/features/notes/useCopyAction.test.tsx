import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToastState } from "@/components/ui/toastStore";
import { useCopyAction } from "./useCopyAction";

const titles = () => getToastState().toasts.map((t) => [t.title, t.tone]);

beforeEach(() => {
  vi.useFakeTimers();
});

describe("useCopyAction", () => {
  it("confirms a copy for two seconds", async () => {
    const write = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useCopyAction(write, {
        success: "Notes copied",
        failure: "Couldn't copy the notes.",
      }),
    );

    await act(() => result.current.copy());

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.copied).toBe(true);
    expect(titles()).toEqual([["Notes copied", "default"]]);

    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(result.current.copied).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.copied).toBe(false);
  });

  it("restarts the confirmation on a repeated copy", async () => {
    const { result } = renderHook(() =>
      useCopyAction(async () => {}, { success: "Copied", failure: "Failed" }),
    );

    await act(() => result.current.copy());
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    await act(() => result.current.copy());
    await act(() => vi.advanceTimersByTimeAsync(1_500));

    expect(result.current.copied).toBe(true);
  });

  it("reports a failed copy", async () => {
    const { result } = renderHook(() =>
      useCopyAction(
        async () => {
          throw new Error("blocked");
        },
        { success: "Copied", failure: "Couldn't copy the notes." },
      ),
    );

    await act(() => result.current.copy());

    expect(result.current.copied).toBe(false);
    expect(titles()).toEqual([["Couldn't copy the notes.", "danger"]]);
  });
});
