import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { buildSummaryPrompt, REPAIR_NOTE } from "./prompts.js";
import { finalizeSummary, llmSummarySchema } from "./summaryOutput.js";
import {
  SummaryError,
  type SummaryInput,
  type SummaryResult,
} from "./types.js";

type LlmModels = { model: string; fallbackModels: string[] };

function generate(prompt: string, temperature: number, models: LlmModels) {
  return generateText({
    model: models.model,
    output: Output.object({ schema: llmSummarySchema }),
    prompt,
    temperature,
    providerOptions: {
      gateway: {
        models: models.fallbackModels,
      } satisfies GatewayProviderOptions,
    },
  });
}

async function generateWithRepair(prompt: string, models: LlmModels) {
  try {
    return await generate(prompt, 0.2, models);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    return generate(`${prompt}\n\n${REPAIR_NOTE}`, 0, models);
  }
}

export async function summarizeTranscript(
  input: SummaryInput,
  models: LlmModels,
): Promise<SummaryResult> {
  const { prompt, truncated } = buildSummaryPrompt(input);
  try {
    // `output` is a getter that throws when the model produced nothing, so it
    // must be read inside the try.
    const { output, response } = await generateWithRepair(prompt, models);
    return {
      summary: finalizeSummary(output, input.segments),
      model: response.modelId,
      truncated,
    };
  } catch (err) {
    throw new SummaryError("Summary generation failed", true, { cause: err });
  }
}
