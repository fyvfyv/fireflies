import type { Segment } from "@shared/schemas";
import { describe, expect, it } from "vitest";
import {
  activeSegment,
  findMatches,
  groupParagraphs,
  paragraphAt,
  transcriptForClipboard,
  transcriptParagraphs,
} from "./paragraphs";

const seg = (
  text: string,
  startSecond: number,
  endSecond: number,
): Segment => ({ text, startSecond, endSecond });

const shape = (segments: Segment[]) =>
  groupParagraphs(segments).map((p) => [
    p.start,
    p.segments.map((s) => s.text),
  ]);

describe("groupParagraphs", () => {
  it.each<[string, Segment[], unknown[]]>([
    [
      "breaks at a pause of 1.5 s",
      [seg("One.", 0, 2), seg("Two.", 3.5, 5), seg("Three.", 6.4, 8)],
      [
        [0, ["One."]],
        [3.5, ["Two.", "Three."]],
      ],
    ],
    [
      "breaks before a paragraph would pass 20 s",
      [seg("A.", 0, 6), seg("B.", 6, 20), seg("C.", 20, 27)],
      [
        [0, ["A.", "B."]],
        [20, ["C."]],
      ],
    ],
    [
      "breaks after a question",
      [seg(" Do you want to start? ", 0, 5), seg(" Sure.", 5.2, 8)],
      [
        [0, ["Do you want to start?"]],
        [5.2, ["Sure."]],
      ],
    ],
  ])("%s", (_, segments, expected) => {
    expect(shape(segments)).toEqual(expected);
  });

  it("skips empty segments and keeps the original positions as ids", () => {
    const [paragraph] = groupParagraphs([
      seg("One.", 0, 1),
      seg("   ", 1, 2),
      seg("Two.", 2, 3),
    ]);

    expect(paragraph).toEqual({
      start: 0,
      end: 3,
      segments: [
        { id: 0, text: "One.", start: 0, end: 1 },
        { id: 2, text: "Two.", start: 2, end: 3 },
      ],
    });
  });
});

describe("findMatches", () => {
  const paragraphs = groupParagraphs([
    seg("The release is on Friday.", 0, 3),
    seg("Release notes follow the release.", 3, 6),
    seg("Budget is 1.5k.", 10, 12),
  ]);

  it("finds every case-insensitive match in reading order", () => {
    expect(findMatches(paragraphs, " RELEASE ")).toEqual([
      { paragraph: 0, segment: 0, start: 4, end: 11 },
      { paragraph: 0, segment: 1, start: 0, end: 7 },
      { paragraph: 0, segment: 1, start: 25, end: 32 },
    ]);
  });

  it("treats the query as plain text and ignores blank ones", () => {
    expect(findMatches(paragraphs, "1.5")).toEqual([
      { paragraph: 1, segment: 0, start: 10, end: 13 },
    ]);
    expect(findMatches(paragraphs, "(")).toEqual([]);
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
    [4.5, 1],
    [7, 1],
    [50, 2],
  ])("%s s → segment %s", (seconds, expected) => {
    expect(activeSegment(paragraphs, seconds)).toBe(expected);
  });
});

describe("paragraphAt", () => {
  const paragraphs = groupParagraphs([seg("One.", 2, 4), seg("Two.", 9, 12)]);

  it.each([
    [0, 0],
    [8, 0],
    [9, 1],
  ])("%s s → paragraph %s", (seconds, expected) => {
    expect(paragraphAt(paragraphs, seconds)).toBe(expected);
  });

  it("returns -1 without timed paragraphs", () => {
    expect(paragraphAt(transcriptParagraphs("Hello.", null), 3)).toBe(-1);
  });
});

describe("transcriptForClipboard", () => {
  it("prefixes timed paragraphs with their time", () => {
    expect(
      transcriptForClipboard("One. Two.", [
        seg("One.", 0, 1),
        seg("Two.", 65, 66),
      ]),
    ).toBe("[00:00] One.\n\n[01:05] Two.");
  });

  it.each<[Segment[] | null]>([[null], [[]]])(
    "uses one paragraph per line with segments %j",
    (segments) => {
      expect(transcriptForClipboard(" One.\n\n Two. \n", segments)).toBe(
        "One.\n\nTwo.",
      );
    },
  );

  it("copies nothing for an empty transcript", () => {
    expect(transcriptForClipboard("  ", [seg("", 0, 1)])).toBe("");
  });
});
