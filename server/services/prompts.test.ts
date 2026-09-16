import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, MAX_TRANSCRIPT_CHARS } from "./prompts.js";

const transcript = "We agreed to ship on Friday. Ana will write the notes.";

describe("buildSummaryPrompt", () => {
  it("embeds the transcript and the rules", () => {
    const { prompt } = buildSummaryPrompt(transcript);

    expect(prompt).toContain(`<transcript>\n${transcript}\n</transcript>`);
    expect(prompt).toMatch(/only facts stated in the transcript/i);
    expect(prompt).toMatch(/empty array/i);
    expect(prompt).toMatch(/owner.*due.*null/i);
    expect(prompt).toMatch(/at most 8 words/i);
    expect(prompt).toMatch(
      /at most 10 key takeaways, 10 decisions and 20 action items/i,
    );
    expect(prompt).toMatch(/same language as the transcript/i);
  });

  it("keeps a transcript at the limit intact", () => {
    const atLimit = "a".repeat(MAX_TRANSCRIPT_CHARS);

    const { prompt, truncated } = buildSummaryPrompt(atLimit);

    expect(truncated).toBe(false);
    expect(prompt).toContain(`<transcript>\n${atLimit}\n</transcript>`);
    expect(prompt).not.toMatch(/cut short/i);
  });

  it("cuts a long transcript and says so", () => {
    const kept = "a".repeat(MAX_TRANSCRIPT_CHARS);

    const { prompt, truncated } = buildSummaryPrompt(`${kept}bc`);

    expect(truncated).toBe(true);
    expect(prompt).toContain(`<transcript>\n${kept}\n</transcript>`);
    expect(prompt).not.toContain("abc");
    expect(prompt).toMatch(/cut short/i);
  });
});
