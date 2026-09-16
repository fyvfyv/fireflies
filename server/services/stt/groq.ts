import { createGroq } from "@ai-sdk/groq";
import { GROQ_STT_MODEL } from "../models.js";
import { transcribeWith } from "./transcribeWith.js";
import type { SttProvider } from "./types.js";

export function groqStt(apiKey: string): SttProvider {
  const model = createGroq({ apiKey }).transcription(GROQ_STT_MODEL);
  return {
    name: `groq:${GROQ_STT_MODEL}`,
    // Groq's default JSON response carries text only; verbose_json adds
    // segments, language and duration.
    transcribe: ({ bytes }) =>
      transcribeWith(model, bytes, {
        groq: {
          responseFormat: "verbose_json",
          timestampGranularities: ["segment"],
        },
      }),
  };
}
