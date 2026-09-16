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

// Two lines share the [14s] label; the recording does not start at zero.
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
    ["Infinity", Number.POSITIVE_INFINITY, null],
    ["-Infinity", Number.NEGATIVE_INFINITY, null],
    ["a negative value", -1, null],
    ["a label before the first start", 0, 0.5],
    ["a label that matches a line", 3, 3.2],
    ["a label between lines", 2, 0.5],
    ["a label shared by two lines, to the first", 14, 14.3],
    ["a fraction inside a segment", 14.6, 14.3],
    ["a value in a silent gap, to the earlier start", 45, 14.9],
    ["a value past the last start", 600, 60],
    ["the last label", 60, 60],
  ])("maps %s", (_, value, expected) => {
    expect(snap(value)).toBe(expected);
  });

  it.each([
    ["no segments", null],
    ["an empty segment list", []],
  ])("nulls every moment with %s", (_, value) => {
    const snapNone = momentSnapper(value);

    expect(snapNone(0)).toBeNull();
    expect(snapNone(12)).toBeNull();
  });

  it("does not depend on segment order", () => {
    const snapShuffled = momentSnapper([...segments].reverse());

    expect(snapShuffled(14)).toBe(14.3);
    expect(snapShuffled(45)).toBe(14.9);
  });

  it("never returns a negative start", () => {
    const snapOdd = momentSnapper([segment(-0.4, 2), segment(2, 4)]);

    expect(snapOdd(0)).toBe(0);
    expect(snapOdd(3)).toBe(2);
  });
});

describe("plainText", () => {
  it.each([
    ["collapses whitespace", "  Ship   on\nFriday ", "Ship on Friday"],
    ["drops a heading marker", "## Release timeline", "Release timeline"],
    ["drops a dash bullet", "- Ship on Friday", "Ship on Friday"],
    ["drops a star bullet", "* Ship on Friday", "Ship on Friday"],
    ["drops a bullet glyph", "• Ship on Friday", "Ship on Friday"],
    ["drops a numbered marker", "1. Ship on Friday", "Ship on Friday"],
    ["drops a quote marker", "> Ship on Friday", "Ship on Friday"],
    ["drops stacked markers", "- ## Release", "Release"],
    ["unwraps bold", "**Release** timeline", "Release timeline"],
    ["unwraps triple stars", "***Release*** timeline", "Release timeline"],
    ["unwraps star italics", "*really* soon", "really soon"],
    ["unwraps underscore italics", "_really_ soon", "really soon"],
    ["unwraps underscore bold", "__really__ soon", "really soon"],
    ["unwraps strikethrough", "~~old~~ new", "old new"],
    ["unwraps inline code", "Run `pnpm verify` first", "Run pnpm verify first"],
    ["keeps link text", "See [the doc](https://x.test/a)", "See the doc"],
    ["keeps image alt text", "![chart](https://x.test/c.png)", "chart"],
    ["drops an unpaired bold marker", "Ship ** on Friday", "Ship on Friday"],
    ["keeps snake_case", "Rename snake_case_name", "Rename snake_case_name"],
    ["keeps arithmetic stars", "5 * 3 = 15 * 1", "5 * 3 = 15 * 1"],
    ["keeps a leading number", "3.5 million users", "3.5 million users"],
    ["keeps a leading negative", "-5 degrees outside", "-5 degrees outside"],
    ["keeps a hashtag word", "#release", "#release"],
    [
      "keeps a leading greater-than",
      "> 50 users signed up",
      "> 50 users signed up",
    ],
    ["keeps a greater-than amount", "> $5k budget", "> $5k budget"],
    ["keeps a spaced minus", "- 5% churn this month", "- 5% churn this month"],
    ["keeps a spaced plus", "+ 3 new hires", "+ 3 new hires"],
    ["drops a bullet before a quoted number", "- > 50 users", "> 50 users"],
    [
      "keeps underscores in code",
      "Rename `__init__.py` now",
      "Rename __init__.py now",
    ],
    ["keeps stars in code", "Pass `**kwargs` on", "Pass **kwargs on"],
    ["keeps markdown-like code", "Run `rm *_old_*`", "Run rm *_old_*"],
    ["drops a stray backtick", "Ship ` on Friday", "Ship on Friday"],
    ["keeps plain text as is", "Ship on Friday.", "Ship on Friday."],
    ["empties whitespace", "   ", ""],
  ])("%s", (_, input, expected) => {
    expect(plainText(input)).toBe(expected);
  });
});

describe("richText", () => {
  it.each([
    [
      "keeps a bold phrase",
      "The team will **ship on Friday**",
      "The team will **ship on Friday**",
    ],
    [
      "keeps several bold phrases",
      "**Ship** it and **test** it",
      "**Ship** it and **test** it",
    ],
    [
      "moves padding out of a bold phrase",
      "The** ship **now",
      "The **ship** now",
    ],
    ["trims padding at the edges", "** ship ** now", "**ship** now"],
    ["normalizes triple stars", "***very*** important", "**very** important"],
    ["drops an empty bold phrase", "a **** b", "a b"],
    ["drops a leading unpaired marker", "**Ship on Friday", "Ship on Friday"],
    [
      "drops the last marker when one is unpaired",
      "**Ship** on Friday **",
      "**Ship** on Friday",
    ],
    ["drops a bullet before bold", "- **Ship** it", "**Ship** it"],
    [
      "unwraps italics next to bold",
      "*Ship* on **Friday**",
      "Ship on **Friday**",
    ],
    [
      "unwraps italics inside bold",
      "**really *big* deal**",
      "**really big deal**",
    ],
    [
      "unwraps code next to bold",
      "`deploy` on **Friday**",
      "deploy on **Friday**",
    ],
    [
      "keeps underscores in code",
      "Rename `__init__.py` in **setup**",
      "Rename __init__.py in **setup**",
    ],
    ["keeps single stars in code", "Use `a*b` **now**", "Use a*b **now**"],
    ["collapses whitespace", " Ship \n **now** ", "Ship **now**"],
  ])("%s", (_, input, expected) => {
    expect(richText(input)).toBe(expected);
  });
});

const raw = (overrides: Partial<LlmSummary> = {}): LlmSummary => ({
  title: "Release planning",
  overview: "The team agreed on the release date.",
  keywords: ["release", "Ana"],
  notes: [
    {
      heading: "Release timeline",
      gist: "The team set the date.",
      startSecond: 0,
      points: [
        {
          text: "The team will **ship on Friday**",
          startSecond: 3,
          details: ["QA signs off Thursday"],
        },
      ],
    },
  ],
  keyTakeaways: ["Release is on Friday"],
  decisions: ["Ship on Friday"],
  actionItems: [
    { task: "Write the notes", owner: "Ana", due: null, startSecond: 14 },
  ],
  ...overrides,
});

const items = (n: number, prefix = "#") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("finalizeSummary", () => {
  it("keeps a clean answer and snaps its moments", () => {
    const summary = finalizeSummary(raw(), segments);

    expect(summary).toEqual({
      ...raw(),
      notes: [
        {
          heading: "Release timeline",
          gist: "The team set the date.",
          startSecond: 0.5,
          points: [
            {
              text: "The team will **ship on Friday**",
              startSecond: 3.2,
              details: ["QA signs off Thursday"],
            },
          ],
        },
      ],
      actionItems: [
        { task: "Write the notes", owner: "Ana", due: null, startSecond: 14.3 },
      ],
    });
    expect(summarySchema.safeParse(summary).success).toBe(true);
  });

  it("nulls every moment when the transcript had no segments", () => {
    const summary = finalizeSummary(raw(), null);

    expect(summary.notes[0]?.startSecond).toBeNull();
    expect(summary.notes[0]?.points[0]?.startSecond).toBeNull();
    expect(summary.actionItems[0]?.startSecond).toBeNull();
  });

  it("nulls moments the schema would reject", () => {
    const summary = finalizeSummary(
      raw({
        actionItems: [
          { task: "a", owner: null, due: null, startSecond: -3 },
          { task: "b", owner: null, due: null, startSecond: Number.NaN },
        ],
      }),
      segments,
    );

    expect(summary.actionItems.map((item) => item.startSecond)).toEqual([
      null,
      null,
    ]);
    expect(summarySchema.safeParse(summary).success).toBe(true);
  });

  it("trims every list to its limit", () => {
    const point = { text: "p", startSecond: null, details: items(9) };
    const section = {
      heading: "h",
      gist: "g",
      startSecond: null,
      points: Array.from({ length: 9 }, () => point),
    };

    const summary = finalizeSummary(
      raw({
        title: "t".repeat(200),
        keywords: items(12, "k"),
        notes: Array.from({ length: 11 }, () => section),
        keyTakeaways: items(12),
        decisions: items(11),
        actionItems: items(25).map((task) => ({
          task,
          owner: null,
          due: null,
          startSecond: null,
        })),
      }),
      segments,
    );

    expect(summarySchema.safeParse(summary).success).toBe(true);
    expect(summary.title).toBe("t".repeat(SUMMARY_LIMITS.titleChars));
    expect(summary.keywords).toEqual(items(8, "k"));
    expect(summary.notes).toHaveLength(SUMMARY_LIMITS.sections);
    expect(summary.notes[0]?.points).toHaveLength(
      SUMMARY_LIMITS.pointsPerSection,
    );
    expect(summary.notes[0]?.points[0]?.details).toEqual(items(4));
    expect(summary.keyTakeaways).toEqual(items(10));
    expect(summary.decisions).toEqual(items(10));
    expect(summary.actionItems.map((a) => a.task)).toEqual(items(20));
  });

  it("strips markdown, keeping bold only in point text", () => {
    const summary = finalizeSummary(
      raw({
        title: "# **Release** planning",
        overview: "The team *finally* agreed.",
        keywords: ["**release**"],
        notes: [
          {
            heading: "## **Release** timeline",
            gist: "- The team set the **date**.",
            startSecond: null,
            points: [
              {
                text: "- The team will **ship** `v2`",
                startSecond: null,
                details: ["* QA signs off **Thursday**"],
              },
            ],
          },
        ],
        keyTakeaways: ["1. **Release** is on track"],
        decisions: ["> Ship on _Friday_"],
        actionItems: [
          {
            task: "**Write** the notes",
            owner: "**Ana**",
            due: "`Friday`",
            startSecond: null,
          },
        ],
      }),
      null,
    );

    expect(summary).toMatchObject({
      title: "Release planning",
      overview: "The team finally agreed.",
      keywords: ["release"],
      notes: [
        {
          heading: "Release timeline",
          gist: "The team set the date.",
          points: [
            {
              text: "The team will **ship** v2",
              details: ["QA signs off Thursday"],
            },
          ],
        },
      ],
      keyTakeaways: ["Release is on track"],
      decisions: ["Ship on Friday"],
      actionItems: [{ task: "Write the notes", owner: "Ana", due: "Friday" }],
    });
  });

  it("drops entries left empty before applying limits", () => {
    const summary = finalizeSummary(
      raw({
        keywords: ["  ", "#", ...items(8, "k")],
        notes: [
          { heading: " ", gist: "g", startSecond: null, points: [] },
          {
            heading: "Kept",
            gist: "g",
            startSecond: null,
            points: [
              { text: "**  **", startSecond: null, details: [] },
              { text: "kept", startSecond: null, details: ["", "- ", "d"] },
            ],
          },
        ],
        keyTakeaways: ["", ...items(10)],
        decisions: ["- "],
        actionItems: [
          { task: "  ", owner: null, due: null, startSecond: null },
          { task: "kept", owner: " ", due: "", startSecond: null },
        ],
      }),
      null,
    );

    expect(summary.keywords).toEqual(items(8, "k"));
    expect(summary.notes).toEqual([
      {
        heading: "Kept",
        gist: "g",
        startSecond: null,
        points: [{ text: "kept", startSecond: null, details: ["d"] }],
      },
    ]);
    expect(summary.keyTakeaways).toEqual(items(10));
    expect(summary.decisions).toEqual([]);
    expect(summary.actionItems).toEqual([
      { task: "kept", owner: null, due: null, startSecond: null },
    ]);
  });

  // A done summary without notes marks one written before notes existed,
  // which POST /notes would send back to the model.
  it("keeps one section when the answer has none", () => {
    const summary = finalizeSummary(raw({ notes: [] }), segments);

    expect(summary.notes).toEqual([
      {
        heading: "Release planning",
        gist: "The team agreed on the release date.",
        startSecond: 0.5,
        points: [],
      },
    ]);
    expect(summarySchema.safeParse(summary).success).toBe(true);
  });

  it("keeps one section when cleanup empties every heading", () => {
    const summary = finalizeSummary(
      raw({
        title: "**",
        overview: "  ",
        notes: [{ heading: "##", gist: "g", startSecond: 3, points: [] }],
      }),
      null,
    );

    expect(summary.notes).toEqual([
      { heading: "Summary", gist: "", startSecond: null, points: [] },
    ]);
  });

  it("drops hashes and duplicates from keywords", () => {
    const summary = finalizeSummary(
      raw({ keywords: ["#release", "Release", "## pricing", "Ana", "ana"] }),
      null,
    );

    expect(summary.keywords).toEqual(["release", "pricing", "Ana"]);
  });
});
