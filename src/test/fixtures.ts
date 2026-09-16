import type { Meeting, MeetingListItem } from "@shared/schemas";

const createdAt = "2026-09-16T12:00:00.000Z";

export function meetingFixture(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "abc",
    title: "Weekly sync",
    titleEdited: false,
    status: "done",
    source: "mic",
    audioPathname: "recordings/abc.webm",
    contentType: "audio/webm",
    sizeBytes: 1024,
    durationSeconds: 125,
    language: "en",
    transcriptText: "Hello team, let's ship the release on Friday.",
    transcriptSegments: [
      {
        text: "Hello team, let's ship the release on Friday.",
        startSecond: 0,
        endSecond: 4.2,
      },
    ],
    transcriptTruncated: false,
    sttProvider: "gateway:openai/whisper-1",
    summary: {
      title: "Weekly sync",
      overview: "The team agreed to ship the release on Friday.",
      keyTakeaways: ["Release is on track"],
      decisions: ["Ship on Friday"],
      actionItems: [{ task: "Tag the release", owner: "Ana", due: "Friday" }],
    },
    errorStep: null,
    errorMessage: null,
    errorRetryable: null,
    attempts: 0,
    processingStartedAt: null,
    createdAt,
    updatedAt: createdAt,
    stalled: false,
    ...overrides,
  };
}

export function meetingListItemFixture(
  overrides: Partial<MeetingListItem> = {},
): MeetingListItem {
  return {
    id: "abc",
    title: "Weekly sync",
    status: "done",
    source: "mic",
    durationSeconds: 125,
    overviewSnippet: "The team agreed to ship the release on Friday.",
    actionItemCount: 3,
    stalled: false,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
