import { generateText, NoOutputGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTextResult, noObjectGeneratedError } from "../test/aiSdk.js";
import { stubSummary, stubTranscript } from "../test/testDeps.js";
import { MAX_TRANSCRIPT_CHARS, REPAIR_NOTE } from "./prompts.js";
import { summarizeTranscript } from "./summarize.js";
import { SummaryError } from "./types.js";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

const models = {
  model: "anthropic/claude-haiku-4.5",
  fallbackModels: ["google/gemini-2.5-flash"],
};
const input = {
  text: stubTranscript.text,
  segments: stubTranscript.segments,
};

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
};

function objectNodes(node: JsonSchemaNode): JsonSchemaNode[] {
  const children = [
    ...Object.values(node.properties ?? {}),
    ...(node.items ? [node.items] : []),
    ...(node.anyOf ?? []),
  ];
  return [...(node.properties ? [node] : []), ...children.flatMap(objectNodes)];
}

const call = (n: number) => vi.mocked(generateText).mock.calls[n]?.[0];

describe("summarizeTranscript", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("asks the configured model and reports the model that answered", async () => {
    vi.mocked(generateText).mockResolvedValue(
      generateTextResult(stubSummary, "google/gemini-2.5-flash"),
    );

    const result = await summarizeTranscript(input, models);

    expect(result).toEqual({
      summary: stubSummary,
      model: "google/gemini-2.5-flash",
      truncated: false,
    });
    expect(generateText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-4.5",
        temperature: 0.2,
        providerOptions: {
          gateway: { models: ["google/gemini-2.5-flash"] },
        },
      }),
    );
    expect(call(0)?.prompt).toContain(
      "[0s] We agreed to ship the release on Friday\n[3s] and Ana owns the notes.",
    );
  });

  it("sends a schema with every field required and no limits or defaults", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    await summarizeTranscript(input, models);

    const format = await call(0)?.output?.responseFormat;
    expect(format).toMatchObject({ type: "json" });
    const { schema } = format as { schema: JsonSchemaNode };
    expect(JSON.stringify(schema)).not.toMatch(
      /maxLength|maxItems|minimum|"default"/,
    );
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "title",
      "overview",
      "keywords",
      "notes",
      "keyTakeaways",
      "decisions",
      "actionItems",
    ]);
    const objects = objectNodes(schema);
    expect(objects).toHaveLength(4);
    for (const node of objects) {
      expect(node.required?.toSorted()).toEqual(
        Object.keys(node.properties ?? {}).toSorted(),
      );
    }
  });

  it("reports a transcript cut to fit the prompt", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));
    const text = "a".repeat(MAX_TRANSCRIPT_CHARS + 1);

    const { truncated } = await summarizeTranscript(
      { text, segments: null },
      models,
    );

    expect(truncated).toBe(true);
  });

  it("trims an answer over the limits instead of failing it", async () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => `item ${i}`);
    vi.mocked(generateText).mockResolvedValue(
      generateTextResult({
        ...stubSummary,
        title: "t".repeat(200),
        keyTakeaways: items(12),
        decisions: items(11),
        actionItems: items(25).map((task) => ({
          task,
          owner: null,
          due: null,
          startSecond: null,
        })),
      }),
    );

    const { summary } = await summarizeTranscript(input, models);

    expect(summary.title).toBe("t".repeat(120));
    expect(summary.keyTakeaways).toEqual(items(10));
    expect(summary.decisions).toEqual(items(10));
    expect(summary.actionItems).toHaveLength(20);
    expect(generateText).toHaveBeenCalledOnce();
  });

  it("retries a malformed answer once at temperature 0 with a repair note", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(noObjectGeneratedError())
      .mockResolvedValueOnce(generateTextResult(stubSummary));

    const { summary } = await summarizeTranscript(input, models);

    expect(summary).toEqual(stubSummary);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(call(1)).toMatchObject({
      temperature: 0,
      prompt: `${call(0)?.prompt}\n\n${REPAIR_NOTE}`,
    });
  });

  it.each([
    ["a second malformed answer", noObjectGeneratedError(), 2],
    ["any other failure without retrying", new Error("401 key sk-secret"), 1],
  ])("wraps %s in a retryable SummaryError", async (_, cause, calls) => {
    vi.mocked(generateText).mockRejectedValue(cause);

    const err = await summarizeTranscript(input, models).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(SummaryError);
    expect(err).toMatchObject({
      message: "Summary generation failed",
      retryable: true,
      cause,
    });
    expect(generateText).toHaveBeenCalledTimes(calls);
  });

  it("wraps a missing output, which the SDK only throws on access", async () => {
    vi.mocked(generateText).mockResolvedValue(
      Object.defineProperty(generateTextResult(undefined), "output", {
        get() {
          throw new NoOutputGeneratedError();
        },
      }),
    );

    await expect(summarizeTranscript(input, models)).rejects.toBeInstanceOf(
      SummaryError,
    );
  });
});
