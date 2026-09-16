import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  SUMMARY_LIMITS,
  type Summary,
  summarySchema,
} from "../../shared/schemas.js";
import { buildSummaryPrompt, REPAIR_NOTE } from "./prompts.js";
import { SummaryError, type SummaryResult } from "./types.js";

type LlmModels = { model: string; fallbackModels: string[] };

// Providers don't enforce length limits while generating (the Anthropic
// provider turns them into description hints), so an over-limit answer would
// fail validation on every attempt. The model gets an unbounded schema and the
// answer is trimmed to summarySchema instead.
const llmSummarySchema = summarySchema.extend({
  title: z.string(),
  keyTakeaways: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(summarySchema.shape.actionItems.element),
});

function fitLimits(summary: z.infer<typeof llmSummarySchema>): Summary {
  return {
    ...summary,
    title: summary.title.slice(0, SUMMARY_LIMITS.titleChars),
    keyTakeaways: summary.keyTakeaways.slice(0, SUMMARY_LIMITS.keyTakeaways),
    decisions: summary.decisions.slice(0, SUMMARY_LIMITS.decisions),
    actionItems: summary.actionItems.slice(0, SUMMARY_LIMITS.actionItems),
  };
}

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
  transcript: string,
  models: LlmModels,
): Promise<SummaryResult> {
  const { prompt, truncated } = buildSummaryPrompt(transcript);
  try {
    // `output` is a getter that throws when the model produced nothing, so it
    // must be read inside the try.
    const { output, response } = await generateWithRepair(prompt, models);
    return { summary: fitLimits(output), model: response.modelId, truncated };
  } catch (err) {
    throw new SummaryError("Summary generation failed", true, { cause: err });
  }
}
