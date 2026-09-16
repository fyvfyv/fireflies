import { tw } from "@tw";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioAnalyser } from "./audioAnalyser";
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
  stream: MediaStream | null;
  mode: WaveformMode;
  className?: string;
};

const METER_MS = 250;
const HISTORY = MAX_BARS + 2;
const DOT_ALPHA = 0.3;

export function LiveWaveform({ stream, mode, className }: LiveWaveformProps) {
  const reducedMotion = useReducedMotion();
  const liveStream = mode === "live" ? stream : null;
  return (
    <div aria-hidden="true" className={tw("h-14", className)}>
      {reducedMotion ? (
        <LevelMeter stream={liveStream} />
      ) : (
        <WaveCanvas stream={liveStream} mode={mode} />
      )}
    </div>
  );
}

function WaveCanvas({
  stream,
  mode,
}: {
  stream: MediaStream | null;
  mode: WaveformMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, ratio: 1 });
  const colorRef = useRef("");
  const levelsRef = useRef<number[]>([]);
  const progressRef = useRef(0);
  const sessionRef = useRef<number[]>([]);
  const modeRef = useRef(mode);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
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

  // Not per frame: getComputedStyle forces a style recalculation.
  const readColor = useCallback(() => {
    if (canvasRef.current) {
      colorRef.current = getComputedStyle(canvasRef.current).color;
    }
  }, []);

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
      const ratio = window.devicePixelRatio;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      sizeRef.current = { width: rect.width, height: rect.height, ratio };
      readColor();
      if (modeRef.current === "frozen") poolSession();
      // Resizing clears the bitmap; only the live loop repaints on its own.
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
      // Runs after the live loop's cleanup has pushed the last bar.
      poolSession();
      draw();
    }
  }, [mode, draw, poolSession]);

  useEffect(() => {
    if (!stream || !canvasRef.current?.getContext("2d")) return;
    const handle = createAudioAnalyser(stream);
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
        // After a stall (background tab), restart rather than replay shifts.
        shiftedAt = time - shiftedAt >= 2 * BAR_MS ? time : shiftedAt + BAR_MS;
      }
      levels[levels.length - 1] = Math.max(levels.at(-1) ?? 0, level);
      progressRef.current = Math.min(1, (time - shiftedAt) / BAR_MS);
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      handle.dispose();
      session.push(levels.at(-1) ?? 0);
    };
  }, [stream, draw]);

  return <canvas ref={canvasRef} className={tw("block size-full text-ink")} />;
}

function LevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) return;
    const handle = createAudioAnalyser(stream);
    if (!handle) return;
    const samples = new Float32Array(handle.analyser.fftSize);
    const timer = setInterval(() => {
      handle.analyser.getFloatTimeDomainData(samples);
      setLevel(levelFromSamples(samples));
    }, METER_MS);
    return () => {
      clearInterval(timer);
      handle.dispose();
      setLevel(0);
    };
  }, [stream]);

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
