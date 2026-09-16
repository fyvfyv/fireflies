import { MAX_AUDIO_BYTES } from "@shared/constants";
import { act, renderHook, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createMeeting, processMeeting } from "@/lib/api";
import { uploadAudio } from "@/lib/upload";
import { meetingFixture } from "@/test/fixtures";
import { routerWrapper } from "@/test/router";
import { type SubmitInput, useSubmitRecording } from "./useSubmitRecording";

vi.mock("@/lib/upload", () => ({ uploadAudio: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createMeeting: vi.fn(),
  processMeeting: vi.fn(),
}));

const mockedUpload = vi.mocked(uploadAudio);
const mockedCreate = vi.mocked(createMeeting);
const mockedProcess = vi.mocked(processMeeting);

const blob = new Blob(["x"], { type: "audio/webm" });
const input: SubmitInput = {
  blob,
  contentType: "audio/webm",
  durationSeconds: 12,
  title: "Standup",
  source: "mic",
};
const uploaded = {
  pathname: "recordings/u1.webm",
  sizeBytes: 1,
  contentType: "audio/webm",
};
const created = meetingFixture({ id: "m1", status: "uploaded" });

const apiError = (status: number, code: string, message: string) =>
  new ApiError({ status, code, message, retryable: true });

function deferredUpload() {
  let finish = () => {};
  mockedUpload.mockReturnValue(
    new Promise((resolve) => {
      finish = () => resolve(uploaded);
    }),
  );
  return () => finish();
}

function renderSubmit() {
  return renderHook(() => useSubmitRecording(), {
    wrapper: routerWrapper("/"),
  });
}

const location = () => screen.getByTestId("location");

beforeEach(() => {
  mockedUpload.mockReset().mockResolvedValue(uploaded);
  mockedCreate.mockReset().mockResolvedValue(created);
  mockedProcess.mockReset().mockResolvedValue({ ...created, status: "done" });
});

describe("useSubmitRecording", () => {
  it("uploads, creates and opens the meeting without waiting for processing", async () => {
    mockedProcess.mockReturnValue(new Promise(() => {}));
    const { result } = renderSubmit();

    await act(() => result.current.submit(input));

    expect(mockedUpload).toHaveBeenCalledWith(blob, "audio/webm");
    expect(mockedCreate).toHaveBeenCalledWith({
      title: "Standup",
      audioPathname: "recordings/u1.webm",
      contentType: "audio/webm",
      sizeBytes: 1,
      source: "mic",
      durationSeconds: 12,
    });
    expect(mockedProcess).toHaveBeenCalledWith("m1");
    expect(location()).toHaveTextContent("/m/m1");
    expect(result.current).toMatchObject({ busy: true, error: null });
  });

  it("does not surface a processing failure", async () => {
    mockedProcess.mockRejectedValue(
      apiError(409, "already_processing", "Already processing"),
    );
    const { result } = renderSubmit();

    await act(() => result.current.submit(input));
    await act(() => Promise.resolve());

    expect(result.current.error).toBeNull();
    expect(location()).toHaveTextContent("/m/m1");
  });

  it("reports the running phase and ignores a second submit", async () => {
    const finishUpload = deferredUpload();
    let finishCreate = () => {};
    mockedCreate.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = () => resolve(created);
      }),
    );
    const { result } = renderSubmit();

    let pending = Promise.resolve();
    act(() => {
      pending = result.current.submit(input);
    });
    expect(result.current).toMatchObject({ phase: "upload", busy: true });
    await act(() => result.current.submit(input));
    expect(mockedUpload).toHaveBeenCalledTimes(1);

    await act(async () => finishUpload());
    expect(result.current).toMatchObject({ phase: "create", busy: true });

    await act(async () => {
      finishCreate();
      await pending;
    });
    expect(location()).toHaveTextContent("/m/m1");
  });

  it("retries a failed upload with the same blob", async () => {
    mockedUpload.mockRejectedValueOnce(new Error("Failed to retrieve token"));
    const { result } = renderSubmit();

    await act(() => result.current.submit(input));

    expect(result.current).toMatchObject({
      phase: "upload",
      busy: false,
      error: "Couldn't upload the audio. Check your connection and try again.",
      canRetry: true,
    });
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(location()).toHaveTextContent(/^\/$/);

    await act(() => result.current.retry());

    expect(mockedUpload).toHaveBeenCalledTimes(2);
    expect(mockedUpload).toHaveBeenLastCalledWith(blob, "audio/webm");
    expect(location()).toHaveTextContent("/m/m1");
    expect(result.current.error).toBeNull();
  });

  it("shows a rate limit from create and retries without uploading again", async () => {
    mockedCreate.mockRejectedValueOnce(
      apiError(429, "rate_limited", "Too many recordings in the last hour."),
    );
    const { result } = renderSubmit();

    await act(() => result.current.submit(input));

    expect(result.current).toMatchObject({
      phase: "create",
      busy: false,
      error: "Too many recordings in the last hour.",
      canRetry: true,
    });
    expect(mockedProcess).not.toHaveBeenCalled();

    await act(() => result.current.retry());

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(location()).toHaveTextContent("/m/m1");
  });

  it("uploads again when a different recording is submitted", async () => {
    mockedCreate.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderSubmit();
    await act(() => result.current.submit(input));

    const other = new Blob(["y"], { type: "audio/webm" });
    await act(() => result.current.submit({ ...input, blob: other }));

    expect(mockedUpload).toHaveBeenCalledTimes(2);
    expect(mockedUpload).toHaveBeenLastCalledWith(other, "audio/webm");
  });

  it("refuses a recording over the size limit before uploading", async () => {
    const { result } = renderSubmit();
    const huge = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]);

    await act(() => result.current.submit({ ...input, blob: huge }));

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      busy: false,
      error: expect.stringMatching(/over the 25 MB limit/),
      canRetry: false,
    });
  });

  it("forgets a failed submission once cleared", async () => {
    mockedUpload.mockRejectedValueOnce(new Error("Failed to retrieve token"));
    const { result } = renderSubmit();
    await act(() => result.current.submit(input));

    act(() => result.current.clear());
    await act(() => result.current.retry());

    expect(result.current).toMatchObject({
      phase: null,
      busy: false,
      error: null,
    });
    expect(mockedUpload).toHaveBeenCalledTimes(1);
  });

  it("does not navigate once unmounted", async () => {
    const finishUpload = deferredUpload();
    let leave = () => {};
    const Router = routerWrapper("/");
    function LeavableRouter({ children }: { children: ReactNode }) {
      const [shown, setShown] = useState(true);
      leave = () => setShown(false);
      return <Router>{shown && children}</Router>;
    }
    const { result } = renderHook(() => useSubmitRecording(), {
      wrapper: LeavableRouter,
    });
    const { submit } = result.current;

    let pending = Promise.resolve();
    act(() => {
      pending = submit(input);
    });
    act(() => leave());
    await act(async () => {
      finishUpload();
      await pending;
    });

    expect(mockedProcess).toHaveBeenCalledWith("m1");
    expect(location()).toHaveTextContent(/^\/$/);
  });
});
