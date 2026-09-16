import {
  NoTranscriptGeneratedError,
  type TranscriptionModel,
  transcribe,
} from "ai";
import { SttError, type Transcript } from "./types.js";

type ProviderOptions = Parameters<typeof transcribe>[0]["providerOptions"];

export async function transcribeWith(
  model: TranscriptionModel,
  bytes: Uint8Array,
  providerOptions: ProviderOptions,
): Promise<Transcript> {
  try {
    const result = await transcribe({ model, audio: bytes, providerOptions });
    return {
      text: result.text.trim(),
      segments: result.segments.map((s) => ({
        text: s.text.trim(),
        startSecond: s.startSecond,
        endSecond: s.endSecond,
      })),
      language: result.language,
      durationSeconds: result.durationInSeconds,
    };
  } catch (err) {
    // The SDK throws on empty text, but silence is valid: the pipeline stores a placeholder summary.
    if (NoTranscriptGeneratedError.isInstance(err)) {
      return { text: "", segments: [] };
    }
    throw new SttError("provider", "Speech-to-text provider failed", true, {
      cause: err,
    });
  }
}
