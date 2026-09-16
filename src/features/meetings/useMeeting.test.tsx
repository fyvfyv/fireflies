import type { Meeting } from "@shared/schemas";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getMeeting } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { keepUnchanged, useMeeting } from "./useMeeting";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMeeting: vi.fn(),
}));

const mockedGet = vi.mocked(getMeeting);

const transcribing = meetingFixture({ status: "transcribing", summary: null });

const apiError = (status: number, message: string) =>
  new ApiError({ status, code: "x", message, retryable: false });

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

async function setup(id = "abc") {
  const hook = renderHook(({ id }) => useMeeting(id), {
    initialProps: { id },
  });
  await advance(0);
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedGet.mockReset();
});

describe("useMeeting", () => {
  it("loads the meeting on mount", async () => {
    mockedGet.mockResolvedValue(meetingFixture());

    const { result } = await setup();

    expect(mockedGet).toHaveBeenCalledWith("abc");
    expect(result.current).toMatchObject({
      meeting: meetingFixture(),
      notFound: false,
      error: null,
    });
  });

  it("polls every 2 s while processing, then every 5 s after a minute", async () => {
    mockedGet.mockResolvedValue(transcribing);
    await setup();

    for (let elapsed = 0; elapsed < 60_000; elapsed += 2_000) {
      await advance(2_000);
    }
    expect(mockedGet).toHaveBeenCalledTimes(31);

    await advance(4_999);
    expect(mockedGet).toHaveBeenCalledTimes(31);
    await advance(1);
    expect(mockedGet).toHaveBeenCalledTimes(32);
  });

  it("stops polling once the meeting is done", async () => {
    const done = meetingFixture();
    mockedGet.mockResolvedValueOnce(transcribing).mockResolvedValue(done);
    const { result } = await setup();

    await advance(2_000);
    expect(result.current.meeting).toEqual(done);

    await advance(10_000);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("polls a failed meeting while keepPolling is set", async () => {
    mockedGet.mockResolvedValue(meetingFixture({ status: "failed" }));
    const { rerender } = renderHook(
      ({ keepPolling }) => useMeeting("abc", { keepPolling }),
      { initialProps: { keepPolling: true } },
    );
    await advance(0);

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    rerender({ keepPolling: false });
    await advance(10_000);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("stops polling a stalled meeting", async () => {
    mockedGet.mockResolvedValue({ ...transcribing, stalled: true });
    await setup();

    await advance(10_000);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("resumes polling after a refetch finds the run moving again", async () => {
    mockedGet
      .mockResolvedValueOnce(meetingFixture({ status: "failed" }))
      .mockResolvedValue(transcribing);
    const { result } = await setup();

    await act(() => result.current.refetch());
    expect(result.current.meeting?.status).toBe("transcribing");

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it("reports a missing meeting", async () => {
    mockedGet.mockRejectedValue(apiError(404, "Meeting not found"));

    const { result } = await setup();

    expect(result.current).toMatchObject({ meeting: null, notFound: true });
  });

  it("keeps the last meeting and keeps polling through a failed refetch", async () => {
    mockedGet
      .mockResolvedValueOnce(transcribing)
      .mockRejectedValueOnce(apiError(0, "Network down"))
      .mockResolvedValue(transcribing);
    const { result } = await setup();

    await advance(2_000);
    expect(result.current).toMatchObject({
      meeting: transcribing,
      error: "Network down",
    });

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeNull();
  });

  it("refetches when the window regains focus", async () => {
    mockedGet.mockResolvedValue(meetingFixture());
    await setup();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("keeps the same object when a poll returns equal data", async () => {
    mockedGet.mockResolvedValue(transcribing);
    const { result } = await setup();
    const first = result.current.meeting;

    mockedGet.mockResolvedValue(structuredClone(transcribing));
    await advance(2_000);

    expect(result.current.meeting).toBe(first);
  });

  it("stops polling on unmount", async () => {
    mockedGet.mockResolvedValue(transcribing);
    const { unmount } = await setup();

    unmount();
    await advance(10_000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("drops the previous meeting when the id changes, ignoring its late response", async () => {
    let finishLate: (meeting: Meeting) => void = () => {};
    mockedGet
      .mockResolvedValueOnce(meetingFixture({ id: "abc" }))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishLate = resolve;
        }),
      )
      .mockResolvedValue(meetingFixture({ id: "xyz" }));
    const { result, rerender } = await setup("abc");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    rerender({ id: "xyz" });
    expect(result.current.meeting).toBeNull();
    await advance(0);
    await act(async () => finishLate(meetingFixture({ id: "abc" })));

    expect(mockedGet).toHaveBeenLastCalledWith("xyz");
    expect(result.current.meeting?.id).toBe("xyz");
  });
});

describe("keepUnchanged", () => {
  it("keeps the previous value, or its equal parts", () => {
    const prev = { a: 1, list: [{ b: "x" }, { b: "y" }], nested: { c: [1] } };
    expect(keepUnchanged(prev, structuredClone(prev))).toBe(prev);

    const next = structuredClone(prev);
    next.list[1] = { b: "z" };
    const result = keepUnchanged(prev, next);

    expect(result).toEqual(next);
    expect(result.nested).toBe(prev.nested);
    expect(result.list[0]).toBe(prev.list[0]);
    expect(result.list).not.toBe(prev.list);
  });

  it.each([
    ["an added undefined key", { a: 1 }, { a: 1, b: undefined }],
    ["a removed key", { a: 1, b: 2 }, { a: 1 }],
    ["a shorter list", [1, 2], [1]],
    ["a list replacing an object", { 0: 1 }, [1]],
    ["null replacing an object", { a: 1 }, null],
  ])("treats %s as a change", (_, prev, next) => {
    const result = keepUnchanged<unknown>(prev, next);

    expect(result).not.toBe(prev);
    expect(result).toStrictEqual(next);
  });
});
