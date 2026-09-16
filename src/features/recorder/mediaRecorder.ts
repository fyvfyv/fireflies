export type RecorderLike = EventTarget & {
  readonly state: string;
  start(timeslice?: number): void;
  stop(): void;
};

export type RecorderCtor = {
  new (
    stream: MediaStream,
    options: { mimeType: string; audioBitsPerSecond: number },
  ): RecorderLike;
  isTypeSupported(type: string): boolean;
};

// Chrome and Firefox record Opus in WebM; Safari only records MP4.
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function supportedMimeType(
  ctor: RecorderCtor | undefined,
): string | undefined {
  return ctor && PREFERRED_TYPES.find((type) => ctor.isTypeSupported(type));
}
