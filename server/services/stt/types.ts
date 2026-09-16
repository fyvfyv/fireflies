import type { Segment } from "../../../shared/schemas.js";

type SttInput = { bytes: Uint8Array; contentType: string };

export type Transcript = {
  text: string;
  segments: Segment[];
  language?: string;
  durationSeconds?: number;
};

export type SttProvider = {
  /** Recorded on the meeting, e.g. `gateway:openai/whisper-1`. */
  name: string;
  transcribe(input: SttInput): Promise<Transcript>;
};

// The message is persisted and shown to users, so it must never carry raw
// provider output.
export class SttError extends Error {
  readonly code: "too_large" | "provider";
  readonly retryable: boolean;

  constructor(
    code: "too_large" | "provider",
    message: string,
    retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SttError";
    this.code = code;
    this.retryable = retryable;
  }
}
