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

const uploaded = meetingFixture({ status: "uploaded", summary: null });

const apiError = (status: number, message: string) =>
  new ApiError({ status, code: "x", message, retryable: false });

const settle = () => act(() => Promise.resolve());

async function setup(meeting: Pick<Meeting, "id" | "status"> | null) {
  const refetch = vi.fn(async () => {});
  const hook = renderHook(({ meeting }) => useAutoProcess(meeting, refetch), {
    initialProps: { meeting },
  });
  await settle();
  return { ...hook, refetch };
}

beforeEach(() => {
  mockedProcess.mockReset().mockResolvedValue(meetingFixture());
});

describe("useAutoProcess", () => {
  it("starts processing an uploaded meeting once, then refetches", async () => {
    const { result, rerender, refetch } = await setup(uploaded);

    expect(mockedProcess).toHaveBeenCalledExactlyOnceWith("abc");
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();

    rerender({ meeting: { ...uploaded } });
    await settle();
    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it("waits for an uploaded meeting", async () => {
    const { rerender, refetch } = await setup(null);
    rerender({ meeting: meetingFixture({ status: "transcribing" }) });
    await settle();
    expect(mockedProcess).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();

    rerender({ meeting: uploaded });
    await settle();
    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it("swallows a 409 when another request already runs the pipeline", async () => {
    mockedProcess.mockRejectedValue(apiError(409, "Already processing"));

    const { result, refetch } = await setup(uploaded);

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("reports a failed start while the meeting still waits", async () => {
    mockedProcess.mockRejectedValue(apiError(0, "Network down"));

    const { result, rerender, refetch } = await setup(uploaded);

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBe("Network down");

    rerender({ meeting: { ...uploaded, status: "transcribing" } });
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
    await settle();

    hook.rerender({ refetch: async () => {} });
    await settle();

    expect(mockedProcess).toHaveBeenCalledTimes(1);
  });

  it("starts processing a different uploaded meeting", async () => {
    const { rerender } = await setup(uploaded);

    rerender({ meeting: { ...uploaded, id: "xyz" } });
    await settle();

    expect(mockedProcess).toHaveBeenLastCalledWith("xyz");
  });
});
