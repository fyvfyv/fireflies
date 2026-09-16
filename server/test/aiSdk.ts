import {
  type generateText,
  NoObjectGeneratedError,
  type TranscriptionResult,
} from "ai";

// Fills the metadata fields adapters never read, so tests only spell out what matters.
export function transcriptionResult(
  overrides: Partial<TranscriptionResult> = {},
): TranscriptionResult {
  return {
    text: " We ship on Friday. Ana owns the notes. ",
    segments: [
      { text: " We ship on Friday.", startSecond: 0, endSecond: 2.5 },
      { text: " Ana owns the notes.", startSecond: 2.5, endSecond: 4.25 },
    ],
    language: "en",
    durationInSeconds: 4.25,
    warnings: [],
    responses: [],
    providerMetadata: {},
    ...overrides,
  };
}

type GenerateTextResult = Awaited<ReturnType<typeof generateText>>;

export function generateTextResult(
  output: unknown,
  modelId = "anthropic/claude-haiku-4.5",
): GenerateTextResult {
  return { output, response: { modelId } } as unknown as GenerateTextResult;
}

export function noObjectGeneratedError(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "No object generated: could not parse the response.",
    text: '{"title": "Release',
    response: {
      id: "resp-1",
      timestamp: new Date("2026-09-16T12:00:00Z"),
      modelId: "anthropic/claude-haiku-4.5",
    },
    usage: {
      inputTokens: 900,
      inputTokenDetails: {
        noCacheTokens: 900,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 40,
      outputTokenDetails: { textTokens: 40, reasoningTokens: undefined },
      totalTokens: 940,
    },
    finishReason: "length",
  });
}
