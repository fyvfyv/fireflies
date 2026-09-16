import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getToastState } from "@/components/ui/toastStore";
import { useCopyAction } from "./useCopyAction";

const messages = { success: "Copied", failure: "Couldn't copy." };
const toasts = () => getToastState().toasts.map((t) => [t.title, t.tone]);

describe("useCopyAction", () => {
  it("confirms a copy for two seconds after the latest one", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => {});
    const { result } = renderHook(() => useCopyAction(write, messages));
    const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    await act(() => result.current.copy());
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.copied).toBe(true);
    expect(toasts()).toEqual([["Copied", "default"]]);

    await wait(1_500);
    await act(() => result.current.copy());
    await wait(1_999);
    expect(result.current.copied).toBe(true);
    await wait(1);
    expect(result.current.copied).toBe(false);
  });

  it("reports a failed copy", async () => {
    const { result } = renderHook(() =>
      useCopyAction(async () => {
        throw new Error("blocked");
      }, messages),
    );

    await act(() => result.current.copy());

    expect(result.current.copied).toBe(false);
    expect(toasts()).toEqual([["Couldn't copy.", "danger"]]);
  });
});
