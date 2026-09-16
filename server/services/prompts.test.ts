import { describe, expect, it } from "vitest";
import type { Segment } from "../../shared/schemas.js";
import { buildSummaryPrompt, MAX_TRANSCRIPT_CHARS } from "./prompts.js";

const text = "We agreed to ship on Friday. Ana will write the notes.";
const segments: Segment[] = [
  { text: " We agreed to ship on Friday.", startSecond: -0.3, endSecond: 2.4 },
  { text: "   ", startSecond: 1, endSecond: 2 },
  { text: " Ana will\nwrite the notes.", startSecond: 2.4, endSecond: 4.9 },
  { text: " Pricing is next.", startSecond: 75.99, endSecond: 78 },
];

const transcriptBlock = (shown: string) =>
  `<transcript>\n${shown}\n</transcript>`;

describe("buildSummaryPrompt", () => {
  it("renders segments as whole-second lines and asks for copied moments", () => {
    const { prompt, truncated } = buildSummaryPrompt({ text, segments });

    expect(truncated).toBe(false);
    expect(prompt).toContain(
      transcriptBlock(
        "[0s] We agreed to ship on Friday.\n[2s] Ana will write the notes.\n[75s] Pricing is next.",
      ),
    );
    expect(prompt).toMatch(/lines start with \[seconds\]/i);
    expect(prompt).not.toMatch(/has no timestamps: set every startSecond/i);
  });

  it.each([
    ["no segments", null],
    ["only blank segments", [{ text: " ", startSecond: 0, endSecond: 1 }]],
  ])(
    "falls back to the plain text with %s and asks for null moments",
    (_, value) => {
      const { prompt } = buildSummaryPrompt({ text, segments: value });

      expect(prompt).toContain(transcriptBlock(text));
      expect(prompt).toMatch(
        /has no timestamps: set every startSecond to null/i,
      );
      expect(prompt).not.toMatch(/lines start with \[seconds\]/i);
    },
  );

  it("states the list limits", () => {
    const { prompt } = buildSummaryPrompt({ text, segments: null });

    expect(prompt).toMatch(/1 to 8 sections/);
    expect(prompt).toMatch(/1 to 6 points/);
    expect(prompt).toMatch(/0 to 4 short details/);
    expect(prompt).toMatch(/up to 8 short topical keywords/);
    expect(prompt).toMatch(
      /at most 10 key takeaways, 10 decisions and 20 action items/,
    );
  });

  it.each([
    ["keeps a transcript at the limit", "", false],
    ["cuts a longer transcript and says so", "bc", true],
  ])("%s", (_, extra, truncated) => {
    const kept = "a".repeat(MAX_TRANSCRIPT_CHARS);

    const result = buildSummaryPrompt({ text: kept + extra, segments: null });

    expect(result.truncated).toBe(truncated);
    expect(result.prompt).toContain(transcriptBlock(kept));
    expect(/cut short/i.test(result.prompt)).toBe(truncated);
  });

  it("applies the limit to the rendered transcript, markers included", () => {
    const first = "x".repeat(MAX_TRANSCRIPT_CHARS - 5);

    const { prompt, truncated } = buildSummaryPrompt({
      text: `${first} tail`,
      segments: [
        { text: first, startSecond: 0, endSecond: 60 },
        { text: "tail", startSecond: 60, endSecond: 61 },
      ],
    });

    expect(truncated).toBe(true);
    expect(prompt).toContain(transcriptBlock(`[0s] ${first}`));
  });
});
