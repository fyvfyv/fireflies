/** The part of an AnalyserNode the waveform reads. */
export type AnalyserLike = {
  readonly fftSize: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
};

export type AnalyserHandle = {
  analyser: AnalyserLike;
  /** Disconnects the graph and closes its AudioContext. */
  dispose: () => void;
};

export type CreateAnalyser = (stream: MediaStream) => AnalyserHandle | null;

const FFT_SIZE = 256;
const SMOOTHING = 0.8;

/** Taps a microphone stream for loudness; null when Web Audio is unusable. */
export function createAudioAnalyser(
  stream: MediaStream,
): AnalyserHandle | null {
  if (typeof globalThis.AudioContext !== "function") return null;
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  const close = () => {
    context.close().catch(() => {});
  };
  try {
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    // Some engines (Safari) only process nodes that reach the destination.
    // A muted gain keeps the graph running without echoing the microphone.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(context.destination);
    // Created after the permission prompt, the context can start suspended
    // because the click that started recording no longer counts as a gesture.
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
