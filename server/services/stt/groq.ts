import { createGroq } from "@ai-sdk/groq";
import { transcribeWith } from "./transcribeWith.js";
import type { SttProvider } from "./types.js";

const MODEL = "whisper-large-v3-turbo";

export function groqStt(apiKey: string): SttProvider {
  const model = createGroq({ apiKey }).transcription(MODEL);
  return {
    name: `groq:${MODEL}`,
    // Groq's default JSON is text only; verbose_json adds segments, language and duration.
    transcribe: ({ bytes }) =>
      transcribeWith(model, bytes, {
        groq: {
          responseFormat: "verbose_json",
          timestampGranularities: ["segment"],
        },
      }),
  };
}
