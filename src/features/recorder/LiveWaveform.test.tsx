import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioAnalyser } from "./audioAnalyser";
import { LiveWaveform } from "./LiveWaveform";

vi.mock("./audioAnalyser", () => ({ createAudioAnalyser: vi.fn() }));

const stream = { id: "mic" } as MediaStream;
// At 240px wide the row holds 40 bars; a silent one is a 3px dot.
const DOTS = Array(40).fill(3);

beforeEach(() => {
  vi.mocked(createAudioAnalyser).mockReset();
});

function fakeAnalyser() {
  const fake = { sample: 1, read: vi.fn(), dispose: vi.fn() };
  fake.read.mockImplementation((samples: Float32Array) => {
    samples.fill(fake.sample);
  });
  vi.mocked(createAudioAnalyser).mockImplementation(() => ({
    analyser: { fftSize: 256, getFloatTimeDomainData: fake.read },
    dispose: fake.dispose,
  }));
  return fake;
}

function stubFrames() {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.fn((callback: FrameRequestCallback) => {
    queue.set(nextId, callback);
    return nextId++;
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  return {
    request,
    pending: () => queue.size,
    run(time: number) {
      const due = queue;
      queue = new Map();
      act(() => {
        for (const callback of due.values()) callback(time);
      });
    },
  };
}

function stubCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as RenderingContext,
  );
  return {
    ctx,
    take(): number[] {
      const heights = ctx.roundRect.mock.calls.map((call) => call[3]);
      ctx.roundRect.mockClear();
      return heights;
    },
  };
}

function stubResizeObserver() {
  let callback: ResizeObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(onResize: ResizeObserverCallback) {
        callback = onResize;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  return {
    disconnect,
    resize(width: number, height: number) {
      const entry = { contentRect: { width, height } } as ResizeObserverEntry;
      act(() => callback([entry], {} as ResizeObserver));
    },
  };
}

describe("LiveWaveform", () => {
  it("does nothing without a 2D context, as in jsdom", () => {
    const frames = stubFrames();

    const { container } = render(<LiveWaveform stream={stream} mode="live" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(createAudioAnalyser).not.toHaveBeenCalled();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("draws a row of dots at the device pixel ratio while idle", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const frames = stubFrames();
    const canvas = stubCanvas();
    const observer = stubResizeObserver();
    const { container } = render(<LiveWaveform stream={null} mode="idle" />);

    observer.resize(240, 56);

    expect(container.querySelector("canvas")).toMatchObject({
      width: 480,
      height: 112,
    });
    expect(canvas.ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(canvas.take()).toEqual(DOTS);
    expect(createAudioAnalyser).not.toHaveBeenCalled();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("samples every frame while live and keeps the whole recording once stopped", () => {
    const frames = stubFrames();
    const canvas = stubCanvas();
    const observer = stubResizeObserver();
    const analyser = fakeAnalyser();
    const { rerender } = render(<LiveWaveform stream={stream} mode="live" />);
    observer.resize(240, 56);
    expect(createAudioAnalyser).toHaveBeenCalledWith(stream);

    for (let time = 0; time <= 700; time += 10) frames.run(time);
    expect(analyser.read).toHaveBeenCalledTimes(71);
    expect(Math.max(...canvas.take())).toBeGreaterThan(3);
    analyser.sample = 0;
    for (let time = 710; time <= 14_000; time += 10) frames.run(time);
    canvas.take();
    frames.run(14_010);
    expect(canvas.take()).toEqual(DOTS);
    expect(frames.pending()).toBe(1);

    rerender(<LiveWaveform stream={null} mode="frozen" />);

    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(frames.pending()).toBe(0);
    expect(Math.max(...canvas.take())).toBeGreaterThan(3);

    const reads = analyser.read.mock.calls.length;
    observer.resize(240, 56);
    expect(Math.max(...canvas.take())).toBeGreaterThan(3);
    expect(analyser.read).toHaveBeenCalledTimes(reads);

    rerender(<LiveWaveform stream={null} mode="idle" />);
    expect(canvas.take()).toEqual(DOTS);
  });

  it("starts fresh for a new stream and releases everything on unmount", () => {
    const frames = stubFrames();
    stubCanvas();
    const observer = stubResizeObserver();
    const analyser = fakeAnalyser();
    const next = { id: "next" } as MediaStream;
    const { rerender, unmount } = render(
      <LiveWaveform stream={stream} mode="live" />,
    );

    rerender(<LiveWaveform stream={next} mode="live" />);
    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(createAudioAnalyser).toHaveBeenLastCalledWith(next);

    unmount();
    expect(analyser.dispose).toHaveBeenCalledTimes(2);
    expect(frames.pending()).toBe(0);
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("keeps the dots when Web Audio is unusable", () => {
    const frames = stubFrames();
    const canvas = stubCanvas();
    const observer = stubResizeObserver();
    vi.mocked(createAudioAnalyser).mockReturnValue(null);

    render(<LiveWaveform stream={stream} mode="live" />);
    observer.resize(240, 56);

    expect(canvas.take()).toEqual(DOTS);
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("shows a level meter instead with reduced motion", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      ...window.matchMedia(""),
      matches: true,
    });
    const frames = stubFrames();
    const analyser = fakeAnalyser();
    const { container, rerender } = render(
      <LiveWaveform stream={stream} mode="live" />,
    );
    const meter = container.querySelector('[data-slot="level-meter"]');

    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(meter).toHaveStyle({ width: "0%" });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(meter).toHaveStyle({ width: "100%" });
    expect(frames.request).not.toHaveBeenCalled();

    rerender(<LiveWaveform stream={null} mode="frozen" />);
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(analyser.read).toHaveBeenCalledTimes(1);
    expect(meter).toHaveStyle({ width: "0%" });
  });
});
