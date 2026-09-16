import {
  AUDIO_BITRATE,
  baseType,
  MAX_RECORDING_MS,
  RECORDING_WARN_MS,
} from "@shared/constants";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RecorderCtor,
  type RecorderLike,
  supportedMimeType,
} from "./mediaRecorder";

type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "denied"
  | "unavailable"
  | "unsupported";

export type RecordingResult = {
  blob: Blob;
  contentType: string;
  durationSeconds: number;
};

export type Recorder = {
  state: RecorderState;
  elapsed: number;
  warning: boolean;
  result: RecordingResult | null;
  /** The microphone stream while recording, for the live waveform. */
  stream: MediaStream | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
};

export type RecorderDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorderCtor: RecorderCtor | undefined;
};

const browserDeps: RecorderDeps = {
  getUserMedia: (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  // Read on use: mediaDevices is missing outside secure contexts, which makes
  // MediaRecorder useless there.
  get MediaRecorderCtor() {
    return navigator.mediaDevices ? globalThis.MediaRecorder : undefined;
  },
};

const PERMISSION_ERRORS = new Set(["NotAllowedError", "SecurityError"]);

type Session = {
  recorder: RecorderLike;
  stream: MediaStream;
  chunks: Blob[];
  startedAt: number;
  timer?: ReturnType<typeof setInterval>;
};

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

export function useRecorder(deps: RecorderDeps = browserDeps): Recorder {
  const [state, setState] = useState<RecorderState>(() =>
    supportedMimeType(deps.MediaRecorderCtor) ? "idle" : "unsupported",
  );
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);

  // Detaches before stopping, so the stop event of a discarded recording is
  // ignored instead of producing a result.
  const endSession = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    clearInterval(session.timer);
    stopTracks(session.stream);
    if (session.recorder.state !== "inactive") session.recorder.stop();
  }, []);

  const stop = useCallback(() => {
    const recorder = sessionRef.current?.recorder;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    const Ctor = deps.MediaRecorderCtor;
    const mimeType = supportedMimeType(Ctor);
    if (!Ctor || !mimeType) {
      setState("unsupported");
      return;
    }
    if (startingRef.current || sessionRef.current) return;

    startingRef.current = true;
    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await deps.getUserMedia({ audio: true });
    } catch (err) {
      const blocked =
        err instanceof DOMException && PERMISSION_ERRORS.has(err.name);
      setState(blocked ? "denied" : "unavailable");
      return;
    } finally {
      startingRef.current = false;
    }
    if (!mountedRef.current) {
      stopTracks(stream);
      return;
    }

    let recorder: RecorderLike;
    try {
      recorder = new Ctor(stream, {
        mimeType,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
    } catch {
      stopTracks(stream);
      setState("unavailable");
      return;
    }

    // The upload and the stored content type drop codec parameters.
    const contentType = baseType(mimeType);
    const session: Session = {
      recorder,
      stream,
      chunks: [],
      startedAt: Date.now(),
    };
    recorder.addEventListener("dataavailable", (event) => {
      const { data } = event as BlobEvent;
      if (data.size > 0) session.chunks.push(data);
    });
    recorder.addEventListener("stop", () => {
      if (sessionRef.current !== session) return;
      const durationSeconds = (Date.now() - session.startedAt) / 1000;
      endSession();
      setStream(null);
      setResult({
        blob: new Blob(session.chunks, { type: contentType }),
        contentType,
        durationSeconds,
      });
      setElapsed(Math.floor(durationSeconds));
      setState("stopped");
    });

    try {
      recorder.start(1000);
    } catch {
      // e.g. the track ended between the permission prompt and start().
      stopTracks(stream);
      setState("unavailable");
      return;
    }
    session.timer = setInterval(() => {
      const ms = Date.now() - session.startedAt;
      setElapsed(Math.floor(ms / 1000));
      if (ms >= MAX_RECORDING_MS) stop();
    }, 1000);
    sessionRef.current = session;
    setStream(stream);
    setResult(null);
    setElapsed(0);
    setState("recording");
  }, [deps, endSession, stop]);

  const reset = useCallback(() => {
    endSession();
    setStream(null);
    setResult(null);
    setElapsed(0);
    setState("idle");
  }, [endSession]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      endSession();
    };
  }, [endSession]);

  const unsaved = state === "recording" || state === "stopped";
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  return {
    state,
    elapsed,
    warning: state === "recording" && elapsed * 1000 >= RECORDING_WARN_MS,
    result,
    // Only a live session's tracks are worth analysing; a stopped stream is dead.
    stream: state === "recording" ? stream : null,
    start,
    stop,
    reset,
  };
}
