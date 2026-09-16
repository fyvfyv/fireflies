import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getMeeting } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { useMeeting } from "./useMeeting";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMeeting: vi.fn(),
}));

const mockedGet = vi.mocked(getMeeting);

const transcribing = meetingFixture({
  status: "transcribing",
  summary: null,
  processingStartedAt: "2026-09-16T12:00:00.000Z",
});

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

async function setup(id = "abc") {
  const hook = renderHook(({ id }) => useMeeting(id), {
    initialProps: { id },
  });
  await advance(0);
  return hook;
}

async function advanceInSteps(totalMs: number, stepMs: number) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await advance(stepMs);
  }
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
    expect(mockedGet).toHaveBeenCalledTimes(1);

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(2);

    await advanceInSteps(58_000, 2_000);
    expect(mockedGet).toHaveBeenCalledTimes(31);

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(31);
    await advance(3_000);
    expect(mockedGet).toHaveBeenCalledTimes(32);
    await advance(5_000);
    expect(mockedGet).toHaveBeenCalledTimes(33);
  });

  it.each(["uploaded", "transcribed", "summarizing"] as const)(
    "keeps polling while %s",
    async (status) => {
      mockedGet.mockResolvedValue({ ...transcribing, status });
      await setup();

      await advance(2_000);

      expect(mockedGet).toHaveBeenCalledTimes(2);
    },
  );

  it("stops polling once the meeting is done", async () => {
    const done = meetingFixture();
    mockedGet.mockResolvedValueOnce(transcribing).mockResolvedValue(done);
    const { result } = await setup();

    await advance(2_000);
    expect(result.current.meeting).toEqual(done);

    await advance(10_000);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("does not poll a failed meeting", async () => {
    mockedGet.mockResolvedValue(
      meetingFixture({ status: "failed", errorStep: "transcribe" }),
    );
    await setup();

    await advance(10_000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("polls a finished meeting while keepPolling is set", async () => {
    mockedGet.mockResolvedValue(
      meetingFixture({ status: "failed", errorStep: "summarize" }),
    );
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

  it("exposes a stalled meeting and stops polling", async () => {
    mockedGet.mockResolvedValue({ ...transcribing, stalled: true });
    const { result } = await setup();

    expect(result.current.meeting?.stalled).toBe(true);
    await advance(10_000);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("reports a missing meeting", async () => {
    mockedGet.mockRejectedValue(
      new ApiError({
        status: 404,
        code: "not_found",
        message: "Meeting not found",
        retryable: false,
      }),
    );

    const { result } = await setup();

    expect(result.current).toMatchObject({
      meeting: null,
      notFound: true,
      error: null,
    });
  });

  it("keeps the last meeting and keeps polling through a failed refetch", async () => {
    mockedGet
      .mockResolvedValueOnce(transcribing)
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: "network",
          message: "Network down",
          retryable: true,
        }),
      )
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
    const done = meetingFixture();
    mockedGet.mockResolvedValue(done);
    await setup();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("refetches on demand and resumes polling", async () => {
    mockedGet
      .mockResolvedValueOnce(meetingFixture({ status: "failed" }))
      .mockResolvedValue(transcribing);
    const { result } = await setup();

    await act(() => result.current.refetch());
    expect(result.current.meeting?.status).toBe("transcribing");

    await advance(2_000);
    expect(mockedGet).toHaveBeenCalledTimes(3);
  });

  it("stops polling on unmount", async () => {
    mockedGet.mockResolvedValue(transcribing);
    const { unmount } = await setup();

    unmount();
    await advance(10_000);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("drops the previous meeting when the id changes", async () => {
    mockedGet.mockResolvedValueOnce(meetingFixture({ id: "abc" }));
    let finishSecond: (meeting: typeof transcribing) => void = () => {};
    mockedGet.mockReturnValueOnce(
      new Promise((resolve) => {
        finishSecond = resolve;
      }),
    );
    const { result, rerender } = await setup("abc");

    rerender({ id: "xyz" });
    expect(result.current.meeting).toBeNull();
    expect(mockedGet).toHaveBeenLastCalledWith("xyz");

    const other = meetingFixture({ id: "xyz" });
    await act(async () => finishSecond(other));
    expect(result.current.meeting).toEqual(other);
  });

  it("ignores a late response for the previous id", async () => {
    let finishFirst: (meeting: typeof transcribing) => void = () => {};
    mockedGet
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockResolvedValue(meetingFixture({ id: "xyz" }));
    const { result, rerender } = await setup("abc");

    rerender({ id: "xyz" });
    await advance(0);
    await act(async () => finishFirst(meetingFixture({ id: "abc" })));

    expect(result.current.meeting?.id).toBe("xyz");
  });
});
