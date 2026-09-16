type AnalyserLike = {
  readonly fftSize: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
};

type AnalyserHandle = {
  analyser: AnalyserLike;
  dispose: () => void;
};

const FFT_SIZE = 256;
const SMOOTHING = 0.8;

export function createAudioAnalyser(
  stream: MediaStream,
): AnalyserHandle | null {
  if (typeof globalThis.AudioContext !== "function") return null;
  let context: AudioContext | undefined;
  const close = () => {
    context?.close().catch(() => {});
  };
  try {
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    // Safari only runs nodes connected to the destination; muted to avoid echo.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(context.destination);
    // Can start suspended: the prompt used up the click's user gesture.
    context.resume().catch(() => {});
    return {
      analyser,
      dispose: () => {
        source.disconnect();
        mute.disconnect();
        close();
      },
    };
  } catch {
    close();
    return null;
  }
}
