import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES } from "./constants.js";
import {
  apiErrorSchema,
  createMeetingInputSchema,
  type Meeting,
  meetingListItemSchema,
  meetingSchema,
  type Summary,
  summarySchema,
} from "./schemas.js";

const summary: Summary = {
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

describe("apiErrorSchema", () => {
  it("parses the error envelope", () => {
    const body = {
      error: { code: "rate_limited", message: "Slow down", retryable: true },
    };

    expect(apiErrorSchema.parse(body)).toEqual(body);
  });
});
