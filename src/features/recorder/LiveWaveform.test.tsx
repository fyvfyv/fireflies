import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalyserHandle } from "./audioAnalyser";
import { LiveWaveform } from "./LiveWaveform";
import { barCountFor } from "./waveform";

const stream = { id: "mic" } as unknown as MediaStream;

function fakeAnalyser(sample = 0.5) {
  const read = vi.fn((samples: Float32Array) => {
    samples.fill(sample);
  });
  const dispose = vi.fn();
  const create = vi.fn(
    (_stream: MediaStream): AnalyserHandle => ({
      analyser: { fftSize: 256, getFloatTimeDomainData: read },
      dispose,
    }),
  );
  return { create, read, dispose };
}

// A controllable animation frame queue.
function stubFrames() {
  let queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    queue.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
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

function stubContext() {
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as RenderingContext,
  );
  const heights = () =>
    ctx.roundRect.mock.calls.map((call) => call[3] as number);
  return { ctx, heights };
}

function stubResizeObserver() {
  const observers: FakeResizeObserver[] = [];
  class FakeResizeObserver {
    targets: Element[] = [];
    disconnect = vi.fn();
    constructor(public callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(target: Element) {
      this.targets.push(target);
    }
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    observers,
    resize(width: number, height: number) {
      act(() => {
        for (const observer of observers) {
          const entries = observer.targets.map(
            (target) =>
              ({
                target,
                contentRect: { width, height },
              }) as ResizeObserverEntry,
          );
          observer.callback(entries, observer as unknown as ResizeObserver);
        }
      });
    },
  };
}

function stubReducedMotion() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      ({
        matches: media === "(prefers-reduced-motion: reduce)",
        media,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const meterFill = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slot="level-meter"]');

describe("LiveWaveform", () => {
  it("is decorative", () => {
    const { container } = render(<LiveWaveform stream={null} mode="idle" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("does nothing without a 2D context, as in jsdom", () => {
    const frames = stubFrames();
    const analyser = fakeAnalyser();

    const { unmount } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    unmount();

    expect(analyser.create).not.toHaveBeenCalled();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("draws a row of dots while idle", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser();

    render(
      <LiveWaveform
        stream={null}
        mode="idle"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 240, 56);
    expect(heights()).toHaveLength(40);
    expect(heights().every((height) => height === 3)).toBe(true);
    expect(analyser.create).not.toHaveBeenCalled();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("sizes the canvas for the device pixel ratio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const { ctx } = stubContext();
    const resize = stubResizeObserver();
    const { container } = render(<LiveWaveform stream={null} mode="idle" />);

    resize.resize(240, 56);

    const canvas = container.querySelector("canvas");
    expect(canvas).toHaveProperty("width", 480);
    expect(canvas).toHaveProperty("height", 112);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("draws bars from the analyser on every frame while live", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser(1);

    render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);
    expect(analyser.create).toHaveBeenCalledWith(stream);
    ctx.roundRect.mockClear();

    frames.run(1000);

    expect(analyser.read).toHaveBeenCalledTimes(1);
    expect(Math.max(...heights())).toBeGreaterThan(3);
    expect(frames.pending()).toBe(1);

    frames.run(1016);
    expect(analyser.read).toHaveBeenCalledTimes(2);
  });

  it("scrolls older levels left as time passes", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser(1);
    render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);

    for (let time = 0; time <= 700; time += 10) frames.run(time);
    ctx.roundRect.mockClear();
    frames.run(710);

    const tall = heights().filter((height) => height > 3);
    expect(tall.length).toBeGreaterThanOrEqual(10);
  });

  it("stops sampling and keeps the bars when stopped", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser(1);
    const { rerender } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);
    for (let time = 0; time <= 300; time += 10) frames.run(time);
    ctx.roundRect.mockClear();

    rerender(
      <LiveWaveform
        stream={null}
        mode="frozen"
        createAnalyser={analyser.create}
      />,
    );

    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(frames.cancel).toHaveBeenCalled();
    expect(frames.pending()).toBe(0);
    expect(heights().some((height) => height > 3)).toBe(true);

    // A resize redraws the same bars without sampling again.
    ctx.roundRect.mockClear();
    resize.resize(240, 56);
    expect(heights().some((height) => height > 3)).toBe(true);
    expect(analyser.read).toHaveBeenCalledTimes(31);
  });

  it("shows the whole recording once stopped, not just its last seconds", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    let sample = 1;
    const analyser = fakeAnalyser();
    analyser.read.mockImplementation((samples: Float32Array) => {
      samples.fill(sample);
    });
    const { rerender } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);
    // Loud for the first 10 bars, then silent for far longer than the live
    // row can show.
    for (let time = 0; time <= 700; time += 10) frames.run(time);
    sample = 0;
    for (let time = 710; time <= 14_000; time += 10) frames.run(time);
    ctx.roundRect.mockClear();
    frames.run(14_010);
    expect(heights().every((height) => height === 3)).toBe(true);

    ctx.roundRect.mockClear();
    rerender(
      <LiveWaveform
        stream={null}
        mode="frozen"
        createAnalyser={analyser.create}
      />,
    );

    const overview = ctx.roundRect.mock.calls;
    expect(overview.length).toBeGreaterThan(0);
    expect(overview.length).toBeLessThanOrEqual(barCountFor(240));
    // The early speech survives as bars taller than they are wide.
    expect(overview.some(([, , width, height]) => height > width)).toBe(true);

    // A wider canvas pools the same recording into more buckets.
    ctx.roundRect.mockClear();
    resize.resize(600, 56);
    expect(heights().length).toBeLessThanOrEqual(barCountFor(600));
    expect(heights().some((height) => height > 4)).toBe(true);

    ctx.roundRect.mockClear();
    rerender(
      <LiveWaveform
        stream={null}
        mode="idle"
        createAnalyser={analyser.create}
      />,
    );
    expect(heights().length).toBeGreaterThan(0);
    expect(heights().every((height) => height <= 4)).toBe(true);

    // A later resize while idle still draws only dots.
    ctx.roundRect.mockClear();
    resize.resize(240, 56);
    expect(heights().every((height) => height === 3)).toBe(true);
  });

  it("goes back to dots when reset to idle", () => {
    const frames = stubFrames();
    const { ctx, heights } = stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser(1);
    const { rerender } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    resize.resize(240, 56);
    for (let time = 0; time <= 300; time += 10) frames.run(time);
    ctx.roundRect.mockClear();

    rerender(
      <LiveWaveform
        stream={null}
        mode="idle"
        createAnalyser={analyser.create}
      />,
    );

    expect(heights()).toHaveLength(40);
    expect(heights().every((height) => height === 3)).toBe(true);
  });

  it("starts fresh for a new stream", () => {
    stubFrames();
    stubContext();
    stubResizeObserver();
    const analyser = fakeAnalyser();
    const { rerender } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );
    const next = { id: "next" } as unknown as MediaStream;

    rerender(
      <LiveWaveform
        stream={next}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );

    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(analyser.create).toHaveBeenLastCalledWith(next);
  });

  it("releases the analyser, frame and observer on unmount", () => {
    const frames = stubFrames();
    stubContext();
    const resize = stubResizeObserver();
    const analyser = fakeAnalyser();
    const { unmount } = render(
      <LiveWaveform
        stream={stream}
        mode="live"
        createAnalyser={analyser.create}
      />,
    );

    unmount();

    expect(analyser.dispose).toHaveBeenCalledTimes(1);
    expect(frames.cancel).toHaveBeenCalledWith(1);
    expect(frames.pending()).toBe(0);
    expect(resize.observers[0]?.disconnect).toHaveBeenCalled();
  });

  it("keeps the dots when no analyser can be made", () => {
    const frames = stubFrames();
    const { heights } = stubContext();
    const resize = stubResizeObserver();
    const failing = vi.fn(() => {
      throw new Error("AudioContext blocked");
    });

    render(
      <LiveWaveform stream={stream} mode="live" createAnalyser={failing} />,
    );
    resize.resize(240, 56);

    expect(heights().every((height) => height === 3)).toBe(true);
    expect(frames.request).not.toHaveBeenCalled();
  });

  describe("with reduced motion", () => {
    it("shows a level meter that updates four times a second", async () => {
      vi.useFakeTimers();
      stubReducedMotion();
      const frames = stubFrames();
      const analyser = fakeAnalyser(1);
      const { container } = render(
        <LiveWaveform
          stream={stream}
          mode="live"
          createAnalyser={analyser.create}
        />,
      );

      expect(container.querySelector("canvas")).not.toBeInTheDocument();
      expect(meterFill(container)).toHaveStyle({ width: "0%" });

      await act(() => vi.advanceTimersByTimeAsync(250));

      expect(analyser.read).toHaveBeenCalledTimes(1);
      expect(meterFill(container)).toHaveStyle({ width: "100%" });
      expect(frames.request).not.toHaveBeenCalled();
    });

    it("empties the meter and releases the analyser once stopped", async () => {
      vi.useFakeTimers();
      stubReducedMotion();
      const analyser = fakeAnalyser(1);
      const { container, rerender } = render(
        <LiveWaveform
          stream={stream}
          mode="live"
          createAnalyser={analyser.create}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(250));

      rerender(
        <LiveWaveform
          stream={null}
          mode="frozen"
          createAnalyser={analyser.create}
        />,
      );
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(analyser.dispose).toHaveBeenCalledTimes(1);
      expect(analyser.read).toHaveBeenCalledTimes(1);
      expect(meterFill(container)).toHaveStyle({ width: "0%" });
    });

    it("stops sampling on unmount", async () => {
      vi.useFakeTimers();
      stubReducedMotion();
      const analyser = fakeAnalyser();
      const { unmount } = render(
        <LiveWaveform
          stream={stream}
          mode="live"
          createAnalyser={analyser.create}
        />,
      );

      unmount();
      await act(() => vi.advanceTimersByTimeAsync(1000));

      expect(analyser.dispose).toHaveBeenCalledTimes(1);
      expect(analyser.read).not.toHaveBeenCalled();
    });
  });
});
