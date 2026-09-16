import { describe, expect, it } from "vitest";
import type { Segment } from "../../shared/schemas.js";
import {
  buildSummaryPrompt,
  MAX_TRANSCRIPT_CHARS,
  renderTranscript,
} from "./prompts.js";

const text = "We agreed to ship on Friday. Ana will write the notes.";
const segments: Segment[] = [
  { text: " We agreed to ship on Friday.", startSecond: 0, endSecond: 2.4 },
  { text: " Ana will write the notes.", startSecond: 2.4, endSecond: 4.9 },
  { text: " Pricing is next.", startSecond: 75.99, endSecond: 78 },
];

const transcriptBlock = (shown: string) =>
  `<transcript>\n${shown}\n</transcript>`;

describe("renderTranscript", () => {
  it("prefixes each segment with its whole start second", () => {
    expect(renderTranscript({ text, segments })).toBe(
      [
        "[0s] We agreed to ship on Friday.",
        "[2s] Ana will write the notes.",
        "[75s] Pricing is next.",
      ].join("\n"),
    );
  });

  it.each([
    ["no segments", null],
    ["an empty segment list", []],
  ])("falls back to the plain text with %s", (_, value) => {
    expect(renderTranscript({ text, segments: value })).toBe(text);
  });

  it("skips blank segments and clamps negative starts to zero", () => {
    const rendered = renderTranscript({
      text,
      segments: [
        { text: "   ", startSecond: 1, endSecond: 2 },
        { text: "Hello\nteam", startSecond: -0.3, endSecond: 1 },
      ],
    });

    expect(rendered).toBe("[0s] Hello team");
  });
});

describe("buildSummaryPrompt", () => {
  it("embeds the plain transcript and the rules", () => {
    const { prompt } = buildSummaryPrompt({ text, segments: null });

    expect(prompt).toContain(transcriptBlock(text));
    expect(prompt).toMatch(/only facts stated in the transcript/i);
    expect(prompt).toMatch(/empty array/i);
    expect(prompt).toMatch(/owner.*due.*null/i);
    expect(prompt).toMatch(/at most 8 words/i);
    expect(prompt).toMatch(
      /at most 10 key takeaways, 10 decisions and 20 action items/i,
    );
    expect(prompt).toMatch(/same language as the transcript/i);
  });

  it("asks for chronological topic notes with bounded sizes", () => {
    const { prompt } = buildSummaryPrompt({ text, segments: null });

    expect(prompt).toMatch(/1 to 8 sections in chronological order/i);
    expect(prompt).toMatch(/heading of at most 6 words/i);
    expect(prompt).toMatch(/title and section headings in sentence case/i);
    expect(prompt).toMatch(/gist.*one sentence/i);
    expect(prompt).toMatch(/1 to 6 points/i);
    expect(prompt).toMatch(/0 to 4 short details/i);
    expect(prompt).toMatch(/\*\*double asterisks\*\*/);
    expect(prompt).toMatch(/no other markdown/i);
    expect(prompt).toMatch(/up to 8 short topical keywords/i);
    expect(prompt).toMatch(/without #/i);
    expect(prompt).toMatch(/short transcript.*one section/i);
  });

  it("asks for moments copied from the line markers when segments exist", () => {
    const { prompt } = buildSummaryPrompt({ text, segments });

    expect(prompt).toContain(
      transcriptBlock(
        "[0s] We agreed to ship on Friday.\n[2s] Ana will write the notes.\n[75s] Pricing is next.",
      ),
    );
    expect(prompt).toMatch(/startSecond.*bracketed seconds.*copied exactly/i);
    expect(prompt).toMatch(/lines start with \[seconds\]/i);
    expect(prompt).not.toMatch(/has no timestamps: set every startSecond/i);
  });

  it("asks for null moments when the transcript has no timestamps", () => {
    const { prompt } = buildSummaryPrompt({ text, segments: null });

    expect(prompt).toMatch(/has no timestamps: set every startSecond to null/i);
    expect(prompt).not.toMatch(/lines start with \[seconds\]/i);
  });

  it("keeps a transcript at the limit intact", () => {
    const atLimit = "a".repeat(MAX_TRANSCRIPT_CHARS);

    const { prompt, truncated } = buildSummaryPrompt({
      text: atLimit,
      segments: null,
    });

    expect(truncated).toBe(false);
    expect(prompt).toContain(transcriptBlock(atLimit));
    expect(prompt).not.toMatch(/cut short/i);
  });

  it("cuts a long transcript and says so", () => {
    const kept = "a".repeat(MAX_TRANSCRIPT_CHARS);

    const { prompt, truncated } = buildSummaryPrompt({
      text: `${kept}bc`,
      segments: null,
    });

    expect(truncated).toBe(true);
    expect(prompt).toContain(transcriptBlock(kept));
    expect(prompt).not.toContain("abc");
    expect(prompt).toMatch(/cut short/i);
  });

  it("applies the limit to the rendered transcript, markers included", () => {
    // "[0s] " + 99_995 chars is exactly the limit; the second line is cut off.
    const first = "x".repeat(MAX_TRANSCRIPT_CHARS - 5);
    const long: Segment[] = [
      { text: first, startSecond: 0, endSecond: 60 },
      { text: "tail", startSecond: 60, endSecond: 61 },
    ];

    const { prompt, truncated } = buildSummaryPrompt({
      text: `${first} tail`,
      segments: long,
    });

    expect(truncated).toBe(true);
    expect(prompt).toContain(transcriptBlock(`[0s] ${first}`));
    expect(prompt).not.toContain("[60s]");
  });

  it("does not flag a rendered transcript that fits", () => {
    const { truncated } = buildSummaryPrompt({ text, segments });

    expect(truncated).toBe(false);
  });
});
