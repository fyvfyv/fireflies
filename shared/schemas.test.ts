import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES } from "./constants.js";
import {
  createMeetingInputSchema,
  type NoteSection,
  type StoredSummary,
  type Summary,
  summarySchema,
} from "./schemas.js";

const section: NoteSection = {
  heading: "Release timeline",
  gist: "The team set the release date.",
  startSecond: 0,
  points: [
    {
      text: "The team will **ship on Friday**",
      startSecond: 0,
      details: ["QA signs off on Thursday"],
    },
  ],
};

const summary: Summary = {
  title: "Weekly standup",
  overview: "The team synced on the release.",
  keywords: ["release", "Ana"],
  notes: [section],
  keyTakeaways: ["Release is on track"],
  decisions: ["Ship on Friday"],
  actionItems: [
    { task: "Write release notes", owner: null, due: null, startSecond: null },
  ],
};

describe("summarySchema", () => {
  it("round-trips a summary with notes, dropping unknown keys", () => {
    expect(summarySchema.parse({ ...summary, sentiment: "positive" })).toEqual(
      summary,
    );
  });

  it("fills the fields a summary stored before notes existed lacks", () => {
    const legacy: StoredSummary = {
      title: "Weekly standup",
      overview: "The team synced on the release.",
      keyTakeaways: [],
      decisions: [],
      actionItems: [{ task: "Write release notes", owner: "Ana", due: null }],
    };

    expect(summarySchema.parse(legacy)).toEqual({
      ...legacy,
      keywords: [],
      notes: [],
      actionItems: [
        {
          task: "Write release notes",
          owner: "Ana",
          due: null,
          startSecond: null,
        },
      ],
    });
  });

  const many = <T>(n: number, item: T) => Array.from({ length: n }, () => item);
  const point = { text: "Point", startSecond: 1, details: [] };
  const { startSecond: _, ...sectionWithoutMoment } = section;

  it("accepts every list at its limit", () => {
    const result = summarySchema.safeParse({
      ...summary,
      keywords: many(8, "k"),
      notes: many(8, {
        ...section,
        points: many(6, { ...point, details: many(4, "d") }),
      }),
      keyTakeaways: many(10, "t"),
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["more than 10 key takeaways", { keyTakeaways: many(11, "t") }],
    ["more than 8 keywords", { keywords: many(9, "k") }],
    ["more than 8 sections", { notes: many(9, section) }],
    [
      "more than 6 points in a section",
      { notes: [{ ...section, points: many(7, point) }] },
    ],
    [
      "more than 4 details on a point",
      {
        notes: [{ ...section, points: [{ ...point, details: many(5, "d") }] }],
      },
    ],
    ["a negative moment", { notes: [{ ...section, startSecond: -1 }] }],
    ["a section without a moment", { notes: [sectionWithoutMoment] }],
  ])("rejects %s", (_, override) => {
    expect(summarySchema.safeParse({ ...summary, ...override }).success).toBe(
      false,
    );
  });
});

describe("createMeetingInputSchema", () => {
  const validInput = {
    audioPathname: "recordings/abc.webm",
    contentType: "audio/webm",
    sizeBytes: 1024,
    source: "mic",
  };

  it("accepts a minimal body and values at the bounds", () => {
    expect(createMeetingInputSchema.safeParse(validInput).success).toBe(true);
    const atBounds = createMeetingInputSchema.safeParse({
      ...validInput,
      contentType: "audio/webm;codecs=opus",
      sizeBytes: MAX_AUDIO_BYTES,
      durationSeconds: 0,
    });
    expect(atBounds.success).toBe(true);
  });

  it.each([
    ["an unknown source", { source: "zoom" }],
    ["a file over 25 MiB", { sizeBytes: MAX_AUDIO_BYTES + 1 }],
    ["an empty file", { sizeBytes: 0 }],
    ["a negative duration", { durationSeconds: -1 }],
    ["a duration over a day", { durationSeconds: 24 * 60 * 60 + 1 }],
    ["a non-audio content type", { contentType: "video/mp4" }],
    ["a pathname outside recordings/", { audioPathname: "secrets/key.txt" }],
    ["a nested pathname", { audioPathname: "recordings/nested/a.webm" }],
    ["a dot-dot segment", { audioPathname: "recordings/../secrets.webm" }],
    [
      "an overlong pathname",
      { audioPathname: `recordings/${"a".repeat(101)}.webm` },
    ],
  ])("rejects %s", (_, override) => {
    const result = createMeetingInputSchema.safeParse({
      ...validInput,
      ...override,
    });

    expect(result.success).toBe(false);
  });
});
