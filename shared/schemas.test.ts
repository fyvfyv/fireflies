import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES } from "./constants.js";
import {
  apiErrorSchema,
  audioUrlSchema,
  createMeetingInputSchema,
  type Meeting,
  meetingListItemSchema,
  meetingSchema,
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
    {
      task: "Write release notes",
      owner: "Ana",
      due: "Friday",
      startSecond: 0,
    },
  ],
};

// Stored before notes existed: no keywords, notes or action item moments.
const legacySummary: StoredSummary = {
  title: "Weekly standup",
  overview: "The team synced on the release.",
  keyTakeaways: ["Release is on track"],
  decisions: ["Ship on Friday"],
  actionItems: [{ task: "Write release notes", owner: "Ana", due: "Friday" }],
};

const doneMeeting: Meeting = {
  id: "7f1c0a4e-2a8b-4c55-9d7e-0f3b1c2d4e5f",
  title: "Weekly standup",
  titleEdited: false,
  status: "done",
  source: "mic",
  audioPathname: "recordings/7f1c0a4e.webm",
  contentType: "audio/webm",
  sizeBytes: 480_000,
  durationSeconds: 120.5,
  language: "en",
  transcriptText: "We ship on Friday.",
  transcriptSegments: [
    { text: "We ship on Friday.", startSecond: 0, endSecond: 2.4 },
  ],
  transcriptTruncated: false,
  sttProvider: "gateway:openai/whisper-1",
  summary,
  errorStep: null,
  errorMessage: null,
  errorRetryable: null,
  attempts: 0,
  processingStartedAt: null,
  createdAt: "2026-09-16T12:00:00.000Z",
  updatedAt: "2026-09-16T12:01:00.000Z",
  stalled: false,
};

const validInput = {
  audioPathname: "recordings/abc.webm",
  contentType: "audio/webm",
  sizeBytes: 1024,
  source: "mic",
};

describe("summarySchema", () => {
  it("accepts empty sections and an unassigned owner", () => {
    const parsed = summarySchema.parse({
      ...summary,
      keyTakeaways: [],
      decisions: [],
      actionItems: [{ task: "Follow up", owner: null, due: null }],
    });

    expect(parsed.actionItems[0]?.owner).toBeNull();
    expect(parsed.keyTakeaways).toEqual([]);
  });

  it("rejects a summary without an overview", () => {
    const { overview: _, ...rest } = summary;

    expect(summarySchema.safeParse(rest).success).toBe(false);
  });

  it("rejects more than 10 key takeaways", () => {
    const keyTakeaways = Array.from({ length: 11 }, (_, i) => `Point ${i}`);

    expect(summarySchema.safeParse({ ...summary, keyTakeaways }).success).toBe(
      false,
    );
  });

  it("strips unknown keys", () => {
    const parsed = summarySchema.parse({ ...summary, sentiment: "positive" });

    expect(parsed).not.toHaveProperty("sentiment");
  });

  it("round-trips a summary with notes", () => {
    expect(summarySchema.parse(summary)).toEqual(summary);
  });

  it("fills the fields a legacy summary lacks", () => {
    const parsed = summarySchema.parse(legacySummary);

    expect(parsed.keywords).toEqual([]);
    expect(parsed.notes).toEqual([]);
    expect(parsed.actionItems).toEqual([
      {
        task: "Write release notes",
        owner: "Ana",
        due: "Friday",
        startSecond: null,
      },
    ]);
  });

  it("accepts moments that are null", () => {
    const parsed = summarySchema.parse({
      ...summary,
      notes: [
        {
          ...section,
          startSecond: null,
          points: [{ text: "Point", startSecond: null, details: [] }],
        },
      ],
      actionItems: [
        { task: "Follow up", owner: null, due: null, startSecond: null },
      ],
    });

    expect(parsed.notes[0]?.startSecond).toBeNull();
    expect(parsed.notes[0]?.points[0]?.startSecond).toBeNull();
    expect(parsed.actionItems[0]?.startSecond).toBeNull();
  });

  it("requires the moment on sections and points", () => {
    const { startSecond: _, ...sectionWithoutMoment } = section;

    expect(
      summarySchema.safeParse({ ...summary, notes: [sectionWithoutMoment] })
        .success,
    ).toBe(false);
  });

  const many = <T>(n: number, item: T) => Array.from({ length: n }, () => item);
  const point = { text: "Point", startSecond: 1, details: [] };

  it.each([
    ["a negative section moment", { notes: [{ ...section, startSecond: -1 }] }],
    [
      "a negative action item moment",
      {
        actionItems: [{ task: "t", owner: null, due: null, startSecond: -0.5 }],
      },
    ],
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
  ])("rejects %s", (_, override) => {
    expect(summarySchema.safeParse({ ...summary, ...override }).success).toBe(
      false,
    );
  });

  it("accepts every list at its limit", () => {
    const result = summarySchema.safeParse({
      ...summary,
      keywords: many(8, "k"),
      notes: many(8, {
        ...section,
        points: many(6, { ...point, details: many(4, "d") }),
      }),
    });

    expect(result.success).toBe(true);
  });
});

describe("createMeetingInputSchema", () => {
  it("accepts a minimal body without title or duration", () => {
    const parsed = createMeetingInputSchema.parse(validInput);

    expect(parsed.durationSeconds).toBeUndefined();
    expect(parsed.title).toBeUndefined();
  });

  it("accepts codec parameters on the content type", () => {
    const result = createMeetingInputSchema.safeParse({
      ...validInput,
      contentType: "audio/webm;codecs=opus",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["an unknown source", { source: "zoom" }],
    ["a file over 25 MiB", { sizeBytes: MAX_AUDIO_BYTES + 1 }],
    ["an empty file", { sizeBytes: 0 }],
    ["a negative duration", { durationSeconds: -1 }],
    ["a duration over a day", { durationSeconds: 24 * 60 * 60 + 1 }],
    ["a non-audio content type", { contentType: "video/mp4" }],
    ["a pathname outside recordings/", { audioPathname: "secrets/key.txt" }],
    ["a bare recordings/ prefix", { audioPathname: "recordings/" }],
    ["a nested pathname", { audioPathname: "recordings/nested/a.webm" }],
    ["a dot-dot segment", { audioPathname: "recordings/../secrets.webm" }],
    ["an encoded dot-dot", { audioPathname: "recordings/%2e%2e/x.webm" }],
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

  it("accepts exactly 25 MiB and a zero duration", () => {
    const result = createMeetingInputSchema.safeParse({
      ...validInput,
      sizeBytes: MAX_AUDIO_BYTES,
      durationSeconds: 0,
    });

    expect(result.success).toBe(true);
  });
});

describe("meetingSchema", () => {
  it("round-trips a done meeting", () => {
    expect(meetingSchema.parse(doneMeeting)).toEqual(doneMeeting);
  });

  it("requires the derived stalled flag", () => {
    const { stalled: _, ...rest } = doneMeeting;

    expect(meetingSchema.safeParse(rest).success).toBe(false);
  });

  it("parses a meeting stored before notes existed, with defaults", () => {
    const parsed = meetingSchema.parse({
      ...doneMeeting,
      summary: legacySummary,
    });

    expect(parsed.summary).toMatchObject({
      keywords: [],
      notes: [],
      actionItems: [{ task: "Write release notes", startSecond: null }],
    });
  });

  it("strips unknown keys such as the creator ip hash", () => {
    const parsed = meetingSchema.parse({
      ...doneMeeting,
      createdIpHash: "abc123",
    });

    expect(parsed).not.toHaveProperty("createdIpHash");
  });
});

describe("meetingListItemSchema", () => {
  it("accepts a meeting without a summary yet", () => {
    const result = meetingListItemSchema.safeParse({
      id: doneMeeting.id,
      title: "Recording",
      status: "uploaded",
      source: "upload",
      durationSeconds: null,
      overviewSnippet: null,
      actionItemCount: 0,
      stalled: false,
      createdAt: doneMeeting.createdAt,
      updatedAt: doneMeeting.updatedAt,
    });

    expect(result.success).toBe(true);
  });
});

describe("audioUrlSchema", () => {
  const audio = {
    url: "https://store.private.blob.vercel-storage.com/recordings/a.webm?sig=1",
    expiresAt: "2026-09-16T13:00:00.000Z",
  };

  it("accepts a signed url with its expiry", () => {
    expect(audioUrlSchema.parse(audio)).toEqual(audio);
  });

  it.each([
    ["a relative url", { url: "/recordings/a.webm" }],
    ["a non-ISO expiry", { expiresAt: "tomorrow" }],
  ])("rejects %s", (_, override) => {
    expect(audioUrlSchema.safeParse({ ...audio, ...override }).success).toBe(
      false,
    );
  });
});

describe("apiErrorSchema", () => {
  it("parses the error envelope", () => {
    const body = {
      error: { code: "rate_limited", message: "Slow down", retryable: true },
    };

    expect(apiErrorSchema.parse(body)).toEqual(body);
  });
});
