import {
  AUDIO_BITRATE,
  MAX_RECORDING_MS,
  RECORDING_WARN_MS,
} from "@shared/constants";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMediaRecorder } from "@/test/fakeMediaRecorder";
import { type RecorderDeps, useRecorder } from "./useRecorder";

class NoCodecRecorder extends FakeMediaRecorder {
  static isTypeSupported = () => false;
}

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
  it("starts idle", () => {
    const { result } = setup();

    expect(result.current).toMatchObject({
      state: "idle",
      elapsed: 0,
      warning: false,
      result: null,
    });
  });

  it("records with the picked mime type and bitrate", async () => {
    const startSpy = vi.spyOn(FakeMediaRecorder.prototype, "start");
    const { result, deps, stream, start } = setup();

    await start();

    expect(result.current.state).toBe("recording");
    expect(deps.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.latest?.stream).toBe(stream);
    expect(FakeMediaRecorder.latest?.options).toEqual({
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    expect(startSpy).toHaveBeenCalledWith(1000);
  });

  it("counts elapsed seconds", async () => {
    const { result, start, advance } = setup();
    await start();

    await advance(3_000);

    expect(result.current.elapsed).toBe(3);
  });

  it("warns when the recording nears the limit", async () => {
    const { result, start, advance } = setup();
    await start();

    await advance(RECORDING_WARN_MS - 1_000);
    expect(result.current.warning).toBe(false);

    await advance(1_000);
    expect(result.current.warning).toBe(true);
    expect(result.current.state).toBe("recording");
  });

  it("stops by itself at the maximum length", async () => {
    const { result, start, advance, trackStop } = setup();
    await start();

    await advance(MAX_RECORDING_MS);

    expect(result.current.state).toBe("stopped");
    expect(result.current.result?.durationSeconds).toBe(
      MAX_RECORDING_MS / 1000,
    );
    expect(result.current.warning).toBe(false);
    expect(trackStop).toHaveBeenCalled();
  });

  it("stops into a blob of the base mime type and releases the mic", async () => {
    const { result, start, advance, trackStop } = setup();
    await start();
    await advance(12_000);

    act(() => result.current.stop());

    expect(result.current.state).toBe("stopped");
    const recording = result.current.result;
    expect(recording?.contentType).toBe("audio/webm");
    expect(recording?.blob.type).toBe("audio/webm");
    expect(recording?.blob.size).toBe(1);
    expect(recording?.durationSeconds).toBe(12);
    expect(result.current.elapsed).toBe(12);
    expect(trackStop).toHaveBeenCalledTimes(1);
  });

  it("stops counting once stopped", async () => {
    const { result, start, advance } = setup();
    await start();
    await advance(2_000);
    act(() => result.current.stop());

    await advance(5_000);

    expect(result.current.elapsed).toBe(2);
  });

  it("reports a blocked microphone as denied", async () => {
    const { result, start } = setup({
      getUserMedia: vi.fn(async () => {
        throw new DOMException("x", "NotAllowedError");
      }),
    });

    await start();

    expect(result.current.state).toBe("denied");
    expect(FakeMediaRecorder.latest).toBeUndefined();
  });

  it("reports a missing microphone as unavailable", async () => {
    const { result, start } = setup({
      getUserMedia: vi.fn(async () => {
        throw new DOMException("x", "NotFoundError");
      }),
    });

    await start();

    expect(result.current.state).toBe("unavailable");
  });

  it("releases the mic when the recorder can't be created", async () => {
    class BrokenRecorder extends FakeMediaRecorder {
      constructor(
        stream: MediaStream,
        options: { mimeType: string; audioBitsPerSecond: number },
      ) {
        super(stream, options);
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

    expect(result.current).toMatchObject({ state: "unavailable", elapsed: 0 });
    expect(trackStop).toHaveBeenCalled();
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("is unsupported without MediaRecorder", async () => {
    const { result, deps, start } = setup({ MediaRecorderCtor: undefined });
    expect(result.current.state).toBe("unsupported");

    await start();

    expect(result.current.state).toBe("unsupported");
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it("is unsupported when no audio format can be recorded", () => {
    const { result } = setup({ MediaRecorderCtor: NoCodecRecorder });

    expect(result.current.state).toBe("unsupported");
  });

  it("ignores a second start while the first is pending", async () => {
    const { result, deps } = setup();

    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()]);
    });

    expect(deps.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("reset discards the recording", async () => {
    const { result, start, advance } = setup();
    await start();
    await advance(4_000);
    act(() => result.current.stop());

    act(() => result.current.reset());

    expect(result.current).toMatchObject({
      state: "idle",
      elapsed: 0,
      result: null,
    });
  });

  it("reset while recording releases the mic without keeping a result", async () => {
    const { result, start, trackStop } = setup();
    await start();

    act(() => result.current.reset());

    expect(result.current.state).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.latest?.state).toBe("inactive");
  });

  it("releases the mic on unmount", async () => {
    const { start, unmount, trackStop } = setup();
    await start();

    unmount();

    expect(trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.latest?.state).toBe("inactive");
  });

  it("releases the mic granted after an unmount", async () => {
    let grant: (stream: MediaStream) => void = () => {};
    const { stream, start, unmount, trackStop } = setup({
      getUserMedia: vi.fn(
        () =>
          new Promise<MediaStream>((resolve) => {
            grant = resolve;
          }),
      ),
    });
    const starting = start();

    unmount();
    grant(stream);
    await starting;

    expect(trackStop).toHaveBeenCalled();
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
