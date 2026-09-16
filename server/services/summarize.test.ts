import { generateText, NoOutputGeneratedError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarySchema } from "../../shared/schemas.js";
import { generateTextResult, noObjectGeneratedError } from "../test/aiSdk.js";
import { stubSummary } from "../test/testDeps.js";
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
const transcript = "We agreed to ship on Friday. Ana will write the notes.";

const promptOfCall = (n: number) =>
  vi.mocked(generateText).mock.calls[n]?.[0].prompt;

describe("summarizeTranscript", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
  });

  it("asks the configured model for a structured summary", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    const result = await summarizeTranscript(transcript, models);

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
    expect(promptOfCall(0)).toContain(transcript);
  });

  it("reports the model that actually answered", async () => {
    vi.mocked(generateText).mockResolvedValue(
      generateTextResult(stubSummary, "google/gemini-2.5-flash"),
    );

    const { model } = await summarizeTranscript(transcript, models);

    expect(model).toBe("google/gemini-2.5-flash");
  });

  it("sends no length limits, which providers don't enforce while generating", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));

    await summarizeTranscript(transcript, models);

    const format =
      await vi.mocked(generateText).mock.calls[0]?.[0].output?.responseFormat;
    expect(format).toMatchObject({ type: "json" });
    expect(JSON.stringify(format)).not.toMatch(/maxLength|maxItems/);
  });

  it("trims an answer over the limits instead of failing it", async () => {
    const items = (n: number) => Array.from({ length: n }, (_, i) => `#${i}`);
    const overLimit = {
      ...stubSummary,
      title: "t".repeat(200),
      keyTakeaways: items(12),
      decisions: items(11),
      actionItems: items(25).map((task) => ({ task, owner: null, due: null })),
    };
    vi.mocked(generateText).mockResolvedValue(generateTextResult(overLimit));

    const { summary } = await summarizeTranscript(transcript, models);

    expect(summarySchema.safeParse(summary).success).toBe(true);
    expect(summary.title).toBe("t".repeat(120));
    expect(summary.keyTakeaways).toEqual(items(10));
    expect(summary.decisions).toEqual(items(10));
    expect(summary.actionItems.map((a) => a.task)).toEqual(items(20));
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("retries a malformed answer once at temperature 0 with a repair note", async () => {
    vi.mocked(generateText)
      .mockRejectedValueOnce(noObjectGeneratedError())
      .mockResolvedValueOnce(generateTextResult(stubSummary));

    const { summary } = await summarizeTranscript(transcript, models);

    expect(summary).toEqual(stubSummary);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenLastCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
    expect(promptOfCall(1)).toContain(REPAIR_NOTE);
    expect(promptOfCall(1)).toContain(transcript);
  });

  it("gives up with a retryable SummaryError after a second malformed answer", async () => {
    vi.mocked(generateText).mockRejectedValue(noObjectGeneratedError());

    const err = await summarizeTranscript(transcript, models).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(SummaryError);
    expect(err).toMatchObject({ retryable: true });
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does not retry other failures and hides their details", async () => {
    const cause = new Error("401 invalid key sk-secret");
    vi.mocked(generateText).mockRejectedValue(cause);

    const err = await summarizeTranscript(transcript, models).catch(
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

    await expect(
      summarizeTranscript(transcript, models),
    ).rejects.toBeInstanceOf(SummaryError);
  });

  it("truncates a very long transcript to 100k characters", async () => {
    vi.mocked(generateText).mockResolvedValue(generateTextResult(stubSummary));
    const long = "a".repeat(100_000) + "b".repeat(100_000);

    const { truncated } = await summarizeTranscript(long, models);

    expect(truncated).toBe(true);
    expect(promptOfCall(0)).toContain(`${"a".repeat(100_000)}\n</transcript>`);
    expect(promptOfCall(0)).not.toContain("aab");
  });
});
