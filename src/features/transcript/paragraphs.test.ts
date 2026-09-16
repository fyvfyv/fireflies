import type { Segment } from "@shared/schemas";
import { describe, expect, it } from "vitest";
import {
  activeSegment,
  findMatches,
  groupParagraphs,
  paragraphAt,
  textParagraphs,
  transcriptForClipboard,
  transcriptToText,
} from "./paragraphs";

const seg = (
  text: string,
  startSecond: number,
  endSecond: number,
): Segment => ({
  text,
  startSecond,
  endSecond,
});

const shape = (paragraphs: ReturnType<typeof groupParagraphs>) =>
  paragraphs.map((p) => [p.start, p.segments.map((s) => s.text)]);

describe("groupParagraphs", () => {
  it("keeps talking without pauses in one paragraph", () => {
    expect(
      shape(
        groupParagraphs([
          seg(" Hello team.", 0, 2),
          seg(" Let's start.", 3.4, 5),
          seg("First item.", 6, 9),
        ]),
      ),
    ).toEqual([[0, ["Hello team.", "Let's start.", "First item."]]]);
  });

  it("starts a new paragraph after a pause of 1.5 s or more", () => {
    expect(
      shape(
        groupParagraphs([
          seg("One.", 0, 2),
          seg("Two.", 3.5, 5),
          seg("Three.", 6.4, 8),
        ]),
      ),
    ).toEqual([
      [0, ["One."]],
      [3.5, ["Two.", "Three."]],
    ]);
  });

  it("starts a new paragraph before one would span more than 20 s", () => {
    expect(
      shape(
        groupParagraphs([
          seg("A.", 0, 6),
          seg("B.", 6, 12),
          seg("C.", 12, 20),
          seg("D.", 20, 27),
          seg("E.", 27, 30),
        ]),
      ),
    ).toEqual([
      [0, ["A.", "B.", "C."]],
      [20, ["D.", "E."]],
    ]);
  });

  it("splits continuous talk into turn-sized paragraphs", () => {
    expect(
      shape(groupParagraphs([seg("First.", 0, 12), seg("Second.", 12.2, 24)])),
    ).toEqual([
      [0, ["First."]],
      [12.2, ["Second."]],
    ]);
  });

  it("starts a new paragraph after a question", () => {
    expect(
      shape(
        groupParagraphs([
          seg(" Do you want to start? ", 0, 5),
          seg(" Sure.", 5.2, 8),
        ]),
      ),
    ).toEqual([
      [0, ["Do you want to start?"]],
      [5.2, ["Sure."]],
    ]);
    expect(
      shape(groupParagraphs([seg("Let's start.", 0, 5), seg("Sure.", 5.2, 9)])),
    ).toEqual([[0, ["Let's start.", "Sure."]]]);
  });

  it("skips empty segments and numbers the rest in order", () => {
    const [paragraph] = groupParagraphs([
      seg("One.", 0, 1),
      seg("   ", 1, 2),
      seg("Two.", 2, 3),
    ]);

    expect(paragraph?.segments).toEqual([
      { id: 0, text: "One.", start: 0, end: 1 },
      { id: 2, text: "Two.", start: 2, end: 3 },
    ]);
    expect(paragraph).toMatchObject({ start: 0, end: 3 });
  });

  it("returns nothing for no segments", () => {
    expect(groupParagraphs([])).toEqual([]);
  });
});

describe("textParagraphs", () => {
  it("splits plain text on line breaks, without times", () => {
    expect(textParagraphs("First line.\n\n Second line. \n")).toEqual([
      {
        start: null,
        end: null,
        segments: [{ id: 0, text: "First line.", start: null, end: null }],
      },
      {
        start: null,
        end: null,
        segments: [{ id: 1, text: "Second line.", start: null, end: null }],
      },
    ]);
  });
});

describe("findMatches", () => {
  const paragraphs = groupParagraphs([
    seg("The release is on Friday.", 0, 3),
    seg("Release notes follow the release.", 3, 6),
    seg("Budget is 1.5k.", 10, 12),
  ]);

  it("finds every case-insensitive match in reading order", () => {
    expect(findMatches(paragraphs, "RELEASE")).toEqual([
      { paragraph: 0, segment: 0, start: 4, end: 11 },
      { paragraph: 0, segment: 1, start: 0, end: 7 },
      { paragraph: 0, segment: 1, start: 25, end: 32 },
    ]);
  });

  it("treats the query as plain text", () => {
    expect(findMatches(paragraphs, "1.5")).toEqual([
      { paragraph: 1, segment: 0, start: 10, end: 13 },
    ]);
    expect(findMatches(paragraphs, "(")).toEqual([]);
  });

  it("ignores surrounding spaces and blank queries", () => {
    expect(findMatches(paragraphs, "  friday ")).toHaveLength(1);
    expect(findMatches(paragraphs, "   ")).toEqual([]);
  });
});

describe("activeSegment", () => {
  const paragraphs = groupParagraphs([
    seg("One.", 2, 4),
    seg("Two.", 4, 6),
    seg("Three.", 9, 12),
  ]);

  it.each([
    [0, null],
    [2, 0],
    [4.5, 1],
    // Pauses keep the last spoken segment lit.
    [7, 1],
    [9, 2],
    [50, 2],
  ])("%s s → segment %s", (seconds, expected) => {
    expect(activeSegment(paragraphs, seconds)).toBe(expected);
  });
});

describe("paragraphAt", () => {
  const paragraphs = groupParagraphs([seg("One.", 2, 4), seg("Two.", 9, 12)]);

  it.each([
    [0, 0],
    [3, 0],
    [8, 0],
    [9, 1],
    [99, 1],
  ])("%s s → paragraph %s", (seconds, expected) => {
    expect(paragraphAt(paragraphs, seconds)).toBe(expected);
  });

  it("returns -1 without timed paragraphs", () => {
    expect(paragraphAt(textParagraphs("Hello."), 3)).toBe(-1);
  });
});

describe("transcriptForClipboard", () => {
  it("uses timed paragraphs when there are segments", () => {
    expect(
      transcriptForClipboard("One. Two.", [
        seg("One.", 0, 1),
        seg("Two.", 65, 66),
      ]),
    ).toBe("[00:00] One.\n\n[01:05] Two.");
  });

  it.each<[Segment[] | null]>([[null], [[]]])(
    "falls back to the text with segments %j",
    (list) => {
      expect(transcriptForClipboard("One.\nTwo.", list)).toBe("One.\n\nTwo.");
    },
  );

  it("copies nothing for an empty transcript", () => {
    expect(transcriptForClipboard("  ", [])).toBe("");
  });
});

describe("transcriptToText", () => {
  it("prefixes each paragraph with its time", () => {
    expect(
      transcriptToText(
        groupParagraphs([seg("One.", 0, 1), seg("Two.", 65, 66)]),
      ),
    ).toBe("[00:00] One.\n\n[01:05] Two.");
  });

  it("copies untimed paragraphs as they are", () => {
    expect(transcriptToText(textParagraphs("One.\nTwo."))).toBe("One.\n\nTwo.");
  });
});
