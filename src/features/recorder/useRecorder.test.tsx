import {
  AUDIO_BITRATE,
  MAX_RECORDING_MS,
  RECORDING_WARN_MS,
} from "@shared/constants";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMediaRecorder } from "@/test/fakeMediaRecorder";
import { type RecorderDeps, useRecorder } from "./useRecorder";

function setup(overrides: Partial<RecorderDeps> = {}) {
  const trackStop = vi.fn();
  const stream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;
  const deps: RecorderDeps = {
    getUserMedia: vi.fn(async () => stream),
    MediaRecorderCtor: FakeMediaRecorder,
    ...overrides,
  };
  const hook = renderHook(() => useRecorder(deps));
  const start = () => act(() => hook.result.current.start());
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  return { ...hook, deps, stream, trackStop, start, advance };
}

const failWith = (name: string) => async () => {
  throw new DOMException("x", name);
};

function beforeUnloadPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.latest = undefined;
});

describe("useRecorder", () => {
  it("records the microphone with the picked mime type and bitrate", async () => {
    const startSpy = vi.spyOn(FakeMediaRecorder.prototype, "start");
    const { result, deps, stream, start } = setup();
    expect(result.current).toMatchObject({ state: "idle", stream: null });

    await start();

    expect(result.current).toMatchObject({ state: "recording", stream });
    expect(deps.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.latest?.options).toEqual({
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    expect(startSpy).toHaveBeenCalledWith(1000);
  });

  it("stops into a blob of the base mime type and releases the mic", async () => {
    const { result, start, advance, trackStop } = setup();
    await start();
    await advance(12_000);
    expect(result.current.elapsed).toBe(12);

    act(() => result.current.stop());
    await advance(5_000);

    expect(result.current).toMatchObject({
      state: "stopped",
      elapsed: 12,
      stream: null,
      result: { contentType: "audio/webm", durationSeconds: 12 },
    });
    expect(result.current.result?.blob.type).toBe("audio/webm");
    expect(result.current.result?.blob.size).toBe(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it("warns near the limit, then stops by itself at it", async () => {
    const { result, start, advance, trackStop } = setup();
    await start();

    await advance(RECORDING_WARN_MS - 1_000);
    expect(result.current.warning).toBe(false);
    await advance(1_000);
    expect(result.current).toMatchObject({ state: "recording", warning: true });

    await advance(MAX_RECORDING_MS - RECORDING_WARN_MS);
    expect(result.current).toMatchObject({
      state: "stopped",
      warning: false,
      stream: null,
      result: { durationSeconds: MAX_RECORDING_MS / 1000 },
    });
    expect(trackStop).toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "unavailable"],
  ])("reports a %s microphone error as %s", async (error, state) => {
    const { result, start } = setup({ getUserMedia: failWith(error) });

    await start();

    expect(result.current.state).toBe(state);
    expect(FakeMediaRecorder.latest).toBeUndefined();
  });

  it("releases the mic when the recorder can't be created", async () => {
    class BrokenRecorder extends FakeMediaRecorder {
      constructor(...args: ConstructorParameters<typeof FakeMediaRecorder>) {
        super(...args);
        throw new DOMException("x", "NotSupportedError");
      }
    }
    const { result, start, trackStop } = setup({
      MediaRecorderCtor: BrokenRecorder,
    });

    await start();

    expect(result.current.state).toBe("unavailable");
    expect(trackStop).toHaveBeenCalled();
  });

  it("releases the mic when the recorder refuses to start", async () => {
    vi.spyOn(FakeMediaRecorder.prototype, "start").mockImplementation(() => {
      throw new DOMException("x", "InvalidModificationError");
    });
    const { result, start, trackStop, advance } = setup();

    await start();
    await advance(2_000);

    expect(result.current).toMatchObject({
      state: "unavailable",
      elapsed: 0,
      stream: null,
    });
    expect(trackStop).toHaveBeenCalled();
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("is unsupported without MediaRecorder or a recordable format", async () => {
    class NoCodecRecorder extends FakeMediaRecorder {
      static isTypeSupported = () => false;
    }
    expect(
      setup({ MediaRecorderCtor: NoCodecRecorder }).result.current.state,
    ).toBe("unsupported");

    const { result, deps, start } = setup({ MediaRecorderCtor: undefined });
    expect(result.current.state).toBe("unsupported");
    await start();
    expect(result.current.state).toBe("unsupported");
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it("ignores a second start while the first is pending", async () => {
    const { result, deps } = setup();

    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(deps.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("reset discards a running recording without a result", async () => {
    const { result, start, advance, trackStop } = setup();
    await start();
    await advance(4_000);

    act(() => result.current.reset());

    expect(result.current).toMatchObject({
      state: "idle",
      elapsed: 0,
      result: null,
      stream: null,
    });
    expect(trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.latest?.state).toBe("inactive");
  });

  it("releases the mic on unmount, even when granted afterwards", async () => {
    const running = setup();
    await running.start();
    running.unmount();
    expect(running.trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.latest?.state).toBe("inactive");

    FakeMediaRecorder.latest = undefined;
    let grant: (stream: MediaStream) => void = () => {};
    const pending = setup({
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    });
    const starting = pending.start();
    pending.unmount();
    grant(pending.stream);
    await starting;
    expect(pending.trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.latest).toBeUndefined();
  });

  it("guards page unload while recording or unsaved", async () => {
    const { result, start } = setup();
    expect(beforeUnloadPrevented()).toBe(false);

    await start();
    expect(beforeUnloadPrevented()).toBe(true);

    act(() => result.current.stop());
    expect(beforeUnloadPrevented()).toBe(true);

    act(() => result.current.reset());
    expect(beforeUnloadPrevented()).toBe(false);
  });
});
