import type { Meeting } from "@shared/schemas";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, processMeeting } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { useAutoProcess } from "./useAutoProcess";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  processMeeting: vi.fn(),
}));

const mockedProcess = vi.mocked(processMeeting);

const uploaded = meetingFixture({
  status: "uploaded",
  transcriptText: null,
  transcriptSegments: null,
  summary: null,
});

async function setup(meeting: Pick<Meeting, "id" | "status"> | null) {
  const refetch = vi.fn(async () => {});
  const hook = renderHook(({ meeting }) => useAutoProcess(meeting, refetch), {
    initialProps: { meeting },
  });
  await act(() => Promise.resolve());
  return { ...hook, refetch };
}

beforeEach(() => {
  mockedProcess.mockReset().mockResolvedValue(meetingFixture());
});

describe("useAutoProcess", () => {
  it("starts processing an uploaded meeting once, then refetches", async () => {
    const { rerender, refetch } = await setup(uploaded);

    expect(mockedProcess).toHaveBeenCalledExactlyOnceWith("abc");
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender({ meeting: { ...uploaded } });
    await act(() => Promise.resolve());
    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it.each(["transcribing", "done", "failed"] as const)(
    "leaves a %s meeting alone",
    async (status) => {
      const { refetch } = await setup(meetingFixture({ status }));

      expect(mockedProcess).not.toHaveBeenCalled();
      expect(refetch).not.toHaveBeenCalled();
    },
  );

  it("waits for the meeting to load", async () => {
    const { rerender } = await setup(null);
    expect(mockedProcess).not.toHaveBeenCalled();

    rerender({ meeting: uploaded });
    await act(() => Promise.resolve());

    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it("swallows a 409 when another request already runs the pipeline", async () => {
    mockedProcess.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "already_processing",
        message: "Meeting is already being processed",
        retryable: false,
      }),
    );

    const { result, refetch } = await setup(uploaded);

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("reports a failed start while the meeting still waits", async () => {
    mockedProcess.mockRejectedValue(
      new ApiError({
        status: 0,
        code: "network",
        message: "Network down",
        retryable: true,
      }),
    );

    const { result, rerender, refetch } = await setup(uploaded);

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("Network down");

    // e.g. the request reached the server before the connection dropped.
    rerender({ meeting: { ...uploaded, status: "transcribing" } });
    expect(result.current).toBeNull();
  });

  it("reports nothing after a successful start", async () => {
    const { result } = await setup(uploaded);

    expect(result.current).toBeNull();
  });

  it("starts once under StrictMode even when refetch changes identity", async () => {
    mockedProcess.mockRejectedValue(new Error("offline"));
    const hook = renderHook(
      ({ refetch }) => useAutoProcess(uploaded, refetch),
      {
        initialProps: { refetch: async () => {} },
        reactStrictMode: true,
      },
    );
    await act(() => Promise.resolve());

    hook.rerender({ refetch: async () => {} });
    await act(() => Promise.resolve());

    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it("starts processing a different uploaded meeting", async () => {
    const { rerender } = await setup(uploaded);

    rerender({ meeting: { ...uploaded, id: "xyz" } });
    await act(() => Promise.resolve());

    expect(mockedProcess).toHaveBeenCalledTimes(2);
    expect(mockedProcess).toHaveBeenLastCalledWith("xyz");
  });
});
