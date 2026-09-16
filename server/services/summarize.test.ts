import { generateText, NoOutputGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarySchema } from "../../shared/schemas.js";
import { generateTextResult, noObjectGeneratedError } from "../test/aiSdk.js";
import { stubSummary, stubTranscript } from "../test/testDeps.js";
import { REPAIR_NOTE } from "./prompts.js";
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
const plainInput = {
  text: "We agreed to ship on Friday. Ana will write the notes.",
  segments: null,
};

type JsonSchemaNode = {
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
};

// Every object in the provider-facing schema, with its path.
function objectNodes(
  node: JsonSchemaNode,
  path = "$",
): [string, JsonSchemaNode][] {
  const own: [string, JsonSchemaNode][] = node.properties ? [[path, node]] : [];
  const children = [
    ...Object.entries(node.properties ?? {}).map(
      ([key, child]) => [`${path}.${key}`, child] as const,
    ),
    ...(node.items ? [[`${path}[]`, node.items] as const] : []),
    ...(node.anyOf ?? []).map((child) => [path, child] as const),
  ];
  return [
    ...own,
    ...children.flatMap(([childPath, child]) => objectNodes(child, childPath)),
  ];
}

const responseSchema = async () => {
  const format =
    await vi.mocked(generateText).mock.calls[0]?.[0].output?.responseFormat;
  expect(format).toMatchObject({ type: "json" });
  return (format as { schema: JsonSchemaNode }).schema;
};

const promptOfCall = (n: number) =>
  vi.mocked(generateText).mock.calls[n]?.[0].prompt;

describe("summarizeTranscript", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("asks the configured model for a structured summary", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    const result = await summarizeTranscript(input, models);

    expect(result).toEqual({
      summary: stubSummary,
      model: "anthropic/claude-haiku-4.5",
      truncated: false,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-4.5",
        output: expect.anything(),
        temperature: 0.2,
        providerOptions: {
          gateway: { models: ["google/gemini-2.5-flash"] },
        },
      }),
    );
    expect(promptOfCall(0)).toContain(
      "[0s] We agreed to ship the release on Friday\n[3s] and Ana owns the notes.",
    );
  });

  it("summarizes a transcript without segments as plain text with no moments", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    const { summary } = await summarizeTranscript(plainInput, models);

    expect(promptOfCall(0)).toContain(
      `<transcript>\n${plainInput.text}\n</transcript>`,
    );
    expect(summary.notes.map((section) => section.startSecond)).toEqual([
      null,
      null,
    ]);
    expect(
      summary.notes.flatMap((s) => s.points.map((p) => p.startSecond)),
    ).toEqual([null, null]);
    expect(summary.actionItems[0]?.startSecond).toBeNull();
  });

  it("snaps the model's moments to segment starts", async () => {
    const answer = {
      ...stubSummary,
      notes: [{ ...stubSummary.notes[0], startSecond: 2 }],
      actionItems: [{ ...stubSummary.actionItems[0], startSecond: 3 }],
    };
    vi.mocked(generateText).mockResolvedValue(generateTextResult(answer));

    const { summary } = await summarizeTranscript(input, models);

    expect(summary.notes[0]?.startSecond).toBe(0);
    expect(summary.actionItems[0]?.startSecond).toBe(3.5);
  });

  it("reports the model that actually answered", async () => {
    vi.mocked(generateText).mockResolvedValue(
      generateTextResult(stubSummary, "google/gemini-2.5-flash"),
    );

    const { model } = await summarizeTranscript(input, models);

    expect(model).toBe("google/gemini-2.5-flash");
  });

  it("sends no length limits, which providers don't enforce while generating", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    await summarizeTranscript(input, models);

    expect(JSON.stringify(await responseSchema())).not.toMatch(
      /maxLength|maxItems|minimum/,
    );
  });

  it("requires every field so the model can't omit one", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    await summarizeTranscript(input, models);

    const schema = await responseSchema();
    const objects = objectNodes(schema);
    expect(objects.map(([path]) => path)).toEqual([
      "$",
      "$.notes[]",
      "$.notes[].points[]",
      "$.actionItems[]",
    ]);
    for (const [path, node] of objects) {
      expect(
        [...(node.required ?? [])].sort(),
        `required keys of ${path}`,
      ).toEqual(Object.keys(node.properties ?? {}).sort());
    }
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "title",
      "overview",
      "keywords",
      "notes",
      "keyTakeaways",
      "decisions",
      "actionItems",
    ]);
    expect(JSON.stringify(schema)).not.toMatch(/"default"/);
  });

  it("trims an answer over the limits instead of failing it", async () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => `#${i}`);
    const overLimit = {
      ...stubSummary,
      title: "t".repeat(200),
      keyTakeaways: items(12),
      decisions: items(11),
      keywords: items(9).map((i) => `tag${i}`),
      actionItems: items(25).map((task) => ({
        task,
        owner: null,
        due: null,
        startSecond: null,
      })),
    };
    vi.mocked(generateText).mockResolvedValue(generateTextResult(overLimit));

    const { summary } = await summarizeTranscript(input, models);

    expect(summarySchema.safeParse(summary).success).toBe(true);
    expect(summary.title).toBe("t".repeat(120));
    expect(summary.keyTakeaways).toEqual(items(10));
    expect(summary.decisions).toEqual(items(10));
    expect(summary.keywords).toEqual(items(8).map((i) => `tag${i}`));
    expect(summary.actionItems.map((a) => a.task)).toEqual(items(20));
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("retries a malformed answer once at temperature 0 with a repair note", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(noObjectGeneratedError())
      .mockResolvedValueOnce(generateTextResult(stubSummary));

    const { summary } = await summarizeTranscript(plainInput, models);

    expect(summary.title).toBe(stubSummary.title);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenLastCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
    expect(promptOfCall(1)).toContain(REPAIR_NOTE);
    expect(promptOfCall(1)).toContain(plainInput.text);
  });

  it("gives up with a retryable SummaryError after a second malformed answer", async () => {
    vi.mocked(generateText).mockRejectedValue(noObjectGeneratedError());

    const err = await summarizeTranscript(input, models).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(SummaryError);
    expect(err).toMatchObject({ retryable: true });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does not retry other failures and hides their details", async () => {
    const cause = new Error("401 invalid key sk-secret");
    vi.mocked(generateText).mockRejectedValue(cause);

    const err = await summarizeTranscript(input, models).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(SummaryError);
    expect(err).toMatchObject({ retryable: true, cause });
    expect((err as SummaryError).message).not.toContain("sk-secret");
    expect(generateText).toHaveBeenCalledTimes(1);
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

  it("truncates a very long transcript to 100k characters", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));
    const long = "a".repeat(100_000) + "b".repeat(100_000);

    const { truncated } = await summarizeTranscript(
      { text: long, segments: null },
      models,
    );

    expect(truncated).toBe(true);
    expect(promptOfCall(0)).toContain(`${"a".repeat(100_000)}\n</transcript>`);
    expect(promptOfCall(0)).not.toContain("aab");
  });
});
