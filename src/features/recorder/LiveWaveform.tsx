import { tw } from "@tw";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AnalyserHandle,
  type CreateAnalyser,
  createAudioAnalyser,
} from "./audioAnalyser";
import { useReducedMotion } from "./useReducedMotion";
import {
  BAR_MS,
  barCountFor,
  layoutBars,
  levelFromSamples,
  MAX_BARS,
  maxPool,
  smoothLevel,
} from "./waveform";

export type WaveformMode = "idle" | "live" | "frozen";

type LiveWaveformProps = {
  /** Only read while `mode` is live. */
  stream: MediaStream | null;
  /**
   * idle: flat dots; live: follows the stream; frozen: an overview of the
   * whole recording.
   */
  mode: WaveformMode;
  /** Injectable so tests can pass a fake analyser. */
  createAnalyser?: CreateAnalyser;
  className?: string;
};

// A level meter that changes a few times a second is the reduced-motion
// stand-in for the scrolling bars.
const METER_MS = 250;
// The widest row plus the slot that scrolls in from the left.
const HISTORY = MAX_BARS + 2;
// Dots mark "no sound yet"; kept faint so speech stands out.
const DOT_ALPHA = 0.3;

function openAnalyser(
  create: CreateAnalyser,
  stream: MediaStream,
): AnalyserHandle | null {
  try {
    return create(stream);
  } catch {
    return null;
  }
}

/** Decorative: the recorder's label and timer carry the state. */
export function LiveWaveform({
  stream,
  mode,
  createAnalyser = createAudioAnalyser,
  className,
}: LiveWaveformProps) {
  const reducedMotion = useReducedMotion();
  const liveStream = mode === "live" ? stream : null;
  return (
    <div aria-hidden="true" className={tw("h-14", className)}>
      {reducedMotion ? (
        <LevelMeter stream={liveStream} createAnalyser={createAnalyser} />
      ) : (
        <WaveCanvas
          stream={liveStream}
          mode={mode}
          createAnalyser={createAnalyser}
        />
      )}
    </div>
  );
}

type CanvasSize = { width: number; height: number; ratio: number };

function WaveCanvas({
  stream,
  mode,
  createAnalyser,
}: {
  stream: MediaStream | null;
  mode: WaveformMode;
  createAnalyser: CreateAnalyser;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0, ratio: 1 });
  const colorRef = useRef("");
  // Oldest first; the last entry is the bar still collecting loudness. Kept
  // in refs so the frozen frame survives the stream going away.
  const levelsRef = useRef<number[]>([]);
  const progressRef = useRef(0);
  // Every finished bar of the recording. The live row only holds the last
  // few seconds, usually the silence before Stop, so the stopped canvas pools
  // this into an overview instead. The 55-minute cap is about 47k numbers.
  const sessionRef = useRef<number[]>([]);
  // Read by the resize observer, which is set up once.
  const modeRef = useRef(mode);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { width, height, ratio } = sizeRef.current;
    if (!ctx || width === 0 || height === 0) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colorRef.current;
    const bars = layoutBars({
      width,
      height,
      levels: levelsRef.current,
      progress: progressRef.current,
    });
    // One path per opacity keeps it to two fills a frame.
    for (const dots of [true, false]) {
      ctx.globalAlpha = dots ? DOT_ALPHA : 1;
      ctx.beginPath();
      for (const bar of bars) {
        if (bar.height <= bar.width !== dots) continue;
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(bar.x, bar.y, bar.width, bar.height, bar.width / 2);
        } else {
          ctx.rect(bar.x, bar.y, bar.width, bar.height);
        }
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, []);

  // Read once per resize or theme switch rather than per frame: computed
  // style lookups force a style recalculation.
  const readColor = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const style = getComputedStyle(canvas);
    colorRef.current = style.getPropertyValue("--ink").trim() || style.color;
  }, []);

  // Fits the session into as many bars as the current width holds.
  const poolSession = useCallback(() => {
    if (sessionRef.current.length === 0) return;
    levelsRef.current = maxPool(
      sessionRef.current,
      barCountFor(sizeRef.current.width),
    );
    progressRef.current = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      sizeRef.current = { width: rect.width, height: rect.height, ratio };
      readColor();
      // The bar count follows the width.
      if (modeRef.current === "frozen") poolSession();
      // Resizing wipes the bitmap; a live loop would repaint on its next
      // frame, but idle and frozen canvases need it now.
      draw();
    });
    observer.observe(canvas);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => {
      readColor();
      draw();
    };
    scheme.addEventListener("change", recolor);
    return () => {
      observer.disconnect();
      scheme.removeEventListener("change", recolor);
    };
  }, [draw, readColor, poolSession]);

  useEffect(() => {
    modeRef.current = mode;
    if (mode === "idle") {
      levelsRef.current = [];
      sessionRef.current = [];
      progressRef.current = 0;
      draw();
    } else if (mode === "frozen" && sessionRef.current.length > 0) {
      // Runs after the live loop's cleanup has added the last bar.
      poolSession();
      draw();
    }
  }, [mode, draw, poolSession]);

  useEffect(() => {
    // Without a 2D context (jsdom, locked-down browsers) there is nothing to
    // draw, so skip the AudioContext as well.
    if (!stream || !canvasRef.current?.getContext("2d")) return;
    const handle = openAnalyser(createAnalyser, stream);
    // A new stream is a new recording.
    const session: number[] = [];
    sessionRef.current = session;
    const levels: number[] = handle ? [0] : [];
    levelsRef.current = levels;
    progressRef.current = 0;
    if (!handle) {
      draw();
      return;
    }
    const { analyser } = handle;
    const samples = new Float32Array(analyser.fftSize);
    let level = 0;
    let shiftedAt: number | null = null;
    let frame = 0;
    const tick = (time: number) => {
      analyser.getFloatTimeDomainData(samples);
      level = smoothLevel(level, levelFromSamples(samples));
      shiftedAt ??= time;
      if (time - shiftedAt >= BAR_MS) {
        levels.push(0);
        session.push(levels.at(-2) ?? 0);
        if (levels.length > HISTORY) {
          levels.splice(0, levels.length - HISTORY);
        }
        // After a stall (a background tab) restart the rhythm instead of
        // replaying every missed shift at once.
        shiftedAt = time - shiftedAt >= 2 * BAR_MS ? time : shiftedAt + BAR_MS;
      }
      // Each bar keeps the loudest moment of its slot, so short syllables
      // still show.
      levels[levels.length - 1] = Math.max(levels.at(-1) ?? 0, level);
      progressRef.current = Math.min(1, (time - shiftedAt) / BAR_MS);
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      handle.dispose();
      // The bar still collecting when recording stopped.
      session.push(levels.at(-1) ?? 0);
    };
  }, [stream, createAnalyser, draw]);

  return <canvas ref={canvasRef} className={tw("block size-full text-ink")} />;
}

function LevelMeter({
  stream,
  createAnalyser,
}: {
  stream: MediaStream | null;
  createAnalyser: CreateAnalyser;
}) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) return;
    const handle = openAnalyser(createAnalyser, stream);
    if (!handle) return;
    const samples = new Float32Array(handle.analyser.fftSize);
    const timer = setInterval(() => {
      handle.analyser.getFloatTimeDomainData(samples);
      setLevel(levelFromSamples(samples));
    }, METER_MS);
    return () => {
      clearInterval(timer);
      handle.dispose();
      // A stopped recording has no level; a stuck meter would suggest it
      // is still listening.
      setLevel(0);
    };
  }, [stream, createAnalyser]);

  return (
    <div className={tw("flex h-full items-center")}>
      <div
        className={tw("h-1.5 w-full overflow-hidden rounded-full bg-sunken")}
      >
        <div
          data-slot="level-meter"
          className={tw("h-full rounded-full bg-ink")}
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
    </div>
  );
}
