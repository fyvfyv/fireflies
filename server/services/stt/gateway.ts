import { gateway } from "@ai-sdk/gateway";
import { transcribeWith } from "./transcribeWith.js";
import type { SttProvider } from "./types.js";

export function gatewayStt(modelId: string): SttProvider {
  const model = gateway.transcriptionModel(modelId);
  return {
    name: `gateway:${modelId}`,
    // The gateway forwards these to OpenAI; segments drive transcript timestamps.
    transcribe: ({ bytes }) =>
      transcribeWith(model, bytes, {
        openai: { timestampGranularities: ["segment"] },
      }),
  };
}
