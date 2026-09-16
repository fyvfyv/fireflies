import { describe, expect, it } from "vitest";
import {
  type Segment,
  SUMMARY_LIMITS,
  summarySchema,
} from "../../shared/schemas.js";
import {
  finalizeSummary,
  type LlmSummary,
  momentSnapper,
  plainText,
  richText,
} from "./summaryOutput.js";

const segment = (startSecond: number, endSecond = startSecond + 1) => ({
  text: `at ${startSecond}`,
  startSecond,
  endSecond,
});

const segments: Segment[] = [
  segment(0.5, 3.2),
  segment(3.2, 14.3),
  segment(14.3, 14.9),
  segment(14.9, 30),
  segment(60, 62.5),
];

describe("momentSnapper", () => {
  const snap = momentSnapper(segments);

  it.each([
    ["null", null, null],
    ["NaN", Number.NaN, null],
    ["a negative value", -1, null],
    ["a label before the first start", 0, 0.5],
    ["a label that matches a line", 3, 3.2],
    ["a label shared by two lines, to the first", 14, 14.3],
    ["a fraction inside a segment", 14.6, 14.3],
    ["a value in a silent gap, to the earlier start", 45, 14.9],
    ["a value past the last start", 600, 60],
  ])("maps %s", (_, value, expected) => {
    expect(snap(value)).toBe(expected);
  });

  it.each([null, []])("nulls every moment without segments (%j)", (value) => {
    expect(momentSnapper(value)(0)).toBeNull();
  });

  it("sorts unordered starts and never returns a negative one", () => {
    const snapOdd = momentSnapper([segment(2, 4), segment(-0.4, 2)]);

    expect(snapOdd(0)).toBe(0);
    expect(snapOdd(3)).toBe(2);
  });
});

describe("plainText", () => {
  it.each([
    ["collapses whitespace", "  Ship   on\nFriday ", "Ship on Friday"],
    ["drops stacked leading markers", "- ## 1. • Release", "Release"],
    [
      "unwraps emphasis",
      "**Release** *really* ~~old~~ __new__ _now_",
      "Release really old new now",
    ],
    [
      "keeps link and image text",
      "See [the doc](https://x.test/a) ![chart](https://x.test/c.png)",
      "See the doc chart",
    ],
    [
      "keeps markdown-like characters in code",
      "Rename `__init__.py` and `**kwargs`",
      "Rename __init__.py and **kwargs",
    ],
    ["drops unpaired markers", "Ship ** on ` Friday", "Ship on Friday"],
    [
      "keeps underscores and stars that are not markdown",
      "Rename snake_case_name 5 * 3 times",
      "Rename snake_case_name 5 * 3 times",
    ],
    ["keeps a hashtag word", "#release", "#release"],
    ["keeps a sign in front of an amount", "- 5% churn", "- 5% churn"],
    ["keeps a sign in front of a currency", "> $5k budget", "> $5k budget"],
    ["drops a bullet before a quoted amount", "- > 50 users", "> 50 users"],
    ["empties whitespace", "   ", ""],
  ])("%s", (_, input, expected) => {
    expect(plainText(input)).toBe(expected);
  });
});

describe("richText", () => {
  it.each([
    [
      "keeps bold phrases, moving padding out",
      "The** ship **now and **test** it",
      "The **ship** now and **test** it",
    ],
    ["normalizes triple stars", "***very*** important", "**very** important"],
    ["drops an empty bold phrase", "a **** b", "a b"],
    [
      "drops the last marker when one is unpaired",
      "**Ship** on Friday **",
      "**Ship** on Friday",
    ],
    [
      "strips other markdown around bold",
      "- **Ship** `deploy` on _Friday_",
      "**Ship** deploy on Friday",
    ],
    [
      "strips italics inside bold",
      "**really *big* deal**",
      "**really big deal**",
    ],
    ["keeps stars in code", "Use `a*b` **now**", "Use a*b **now**"],
  ])("%s", (_, input, expected) => {
    expect(richText(input)).toBe(expected);
  });
});

const answer = (
  text: string,
  {
    pointText = text,
    startSecond = null,
  }: { pointText?: string; startSecond?: number | null } = {},
): LlmSummary => ({
  title: text,
  overview: text,
  keywords: [text],
  notes: [
    {
      heading: text,
      gist: text,
      startSecond,
      points: [{ text: pointText, startSecond, details: [text] }],
    },
  ],
  keyTakeaways: [text],
  decisions: [text],
  actionItems: [{ task: text, owner: text, due: text, startSecond }],
});

const items = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("finalizeSummary", () => {
  it("keeps a clean answer and snaps its moments to segment starts", () => {
    const pointText = "Ship **on Friday**";

    const summary = finalizeSummary(
      answer("Ship it", { pointText, startSecond: 14 }),
      segments,
    );

    expect(summary).toEqual(
      answer("Ship it", { pointText, startSecond: 14.3 }),
    );
    expect(summarySchema.safeParse(summary).success).toBe(true);
  });

  it("strips markdown, keeping bold only in point text", () => {
    expect(finalizeSummary(answer("- **Ship** `v2`"), null)).toEqual(
      answer("Ship v2", { pointText: "**Ship** v2" }),
    );
  });

  it("trims the notes and keywords to their limits", () => {
    const point = { text: "p", startSecond: null, details: items(9, "d") };
    const section = {
      heading: "h",
      gist: "g",
      startSecond: null,
      points: Array.from({ length: 9 }, () => point),
    };

    const summary = finalizeSummary(
      {
        ...answer("x"),
        keywords: items(12, "k"),
        notes: Array.from({ length: 11 }, () => section),
      },
      segments,
    );

    expect(summarySchema.safeParse(summary).success).toBe(true);
    expect(summary.keywords).toEqual(items(SUMMARY_LIMITS.keywords, "k"));
    expect(summary.notes).toHaveLength(SUMMARY_LIMITS.sections);
    expect(summary.notes[0]?.points).toHaveLength(
      SUMMARY_LIMITS.pointsPerSection,
    );
    expect(summary.notes[0]?.points[0]?.details).toEqual(
      items(SUMMARY_LIMITS.detailsPerPoint, "d"),
    );
  });

  it("drops entries left empty before applying limits", () => {
    const summary = finalizeSummary(
      {
        ...answer("x"),
        keywords: ["#", ...items(8, "k")],
        notes: [
          {
            heading: "Kept",
            gist: "g",
            startSecond: null,
            points: [
              { text: "**  **", startSecond: null, details: [] },
              { text: "kept", startSecond: null, details: [] },
            ],
          },
        ],
        keyTakeaways: ["- ", ...items(10, "t")],
        actionItems: [{ task: "kept", owner: " ", due: "", startSecond: null }],
      },
      null,
    );

    expect(summary).toMatchObject({
      keywords: items(8, "k"),
      notes: [{ heading: "Kept", points: [{ text: "kept" }] }],
      keyTakeaways: items(10, "t"),
      actionItems: [{ task: "kept", owner: null, due: null }],
    });
  });

  it("keeps one section, named after the title, when the answer has none", () => {
    const summary = finalizeSummary(
      { ...answer("Standup"), overview: "Short sync.", notes: [] },
      segments,
    );

    expect(summary.notes).toEqual([
      { heading: "Standup", gist: "Short sync.", startSecond: 0.5, points: [] },
    ]);
  });

  it("keeps a Summary section when cleanup empties everything", () => {
    expect(finalizeSummary(answer("- "), null)).toEqual({
      title: "",
      overview: "",
      keywords: [],
      notes: [{ heading: "Summary", gist: "", startSecond: null, points: [] }],
      keyTakeaways: [],
      decisions: [],
      actionItems: [],
    });
  });

  it("drops hashes and case-insensitive duplicates from keywords", () => {
    const summary = finalizeSummary(
      {
        ...answer("x"),
        keywords: ["#release", "Release", "## pricing", "Ana", "ana"],
      },
      null,
    );

    expect(summary.keywords).toEqual(["release", "pricing", "Ana"]);
  });
});
