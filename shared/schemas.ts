import { z } from "zod";
import {
  isAllowedAudioType,
  MAX_AUDIO_BYTES,
  RECORDING_PATHNAME,
} from "./constants.js";

export const MEETING_STATUSES = [
  "uploaded",
  "transcribing",
  "transcribed",
  "summarizing",
  "done",
  "failed",
] as const;
export const SOURCES = ["mic", "upload", "demo"] as const;
export const ERROR_STEPS = ["transcribe", "summarize"] as const;

const meetingStatus = z.enum(MEETING_STATUSES);
export type MeetingStatus = z.infer<typeof meetingStatus>;

const source = z.enum(SOURCES);
export type Source = z.infer<typeof source>;

const errorStep = z.enum(ERROR_STEPS);
export type ErrorStep = z.infer<typeof errorStep>;

const segmentSchema = z.object({
  text: z.string(),
  startSecond: z.number(),
  endSecond: z.number(),
});
export type Segment = z.infer<typeof segmentSchema>;

export const SUMMARY_LIMITS = {
  titleChars: 120,
  keyTakeaways: 10,
  decisions: 10,
  actionItems: 20,
  keywords: 8,
  sections: 8,
  pointsPerSection: 6,
  detailsPerPoint: 4,
} as const;

const momentSchema = z.number().nonnegative().nullable();

const notePointSchema = z.object({
  text: z.string(),
  startSecond: momentSchema,
  details: z.array(z.string()).max(SUMMARY_LIMITS.detailsPerPoint),
});

const noteSectionSchema = z.object({
  heading: z.string(),
  gist: z.string(),
  startSecond: momentSchema,
  points: z.array(notePointSchema).max(SUMMARY_LIMITS.pointsPerSection),
});
export type NoteSection = z.output<typeof noteSectionSchema>;

const actionItemSchema = z.object({
  task: z.string(),
  owner: z.string().nullable(),
  due: z.string().nullable(),
  startSecond: momentSchema.default(null),
});
export type ActionItem = z.output<typeof actionItemSchema>;

export const summarySchema = z.object({
  title: z.string().max(SUMMARY_LIMITS.titleChars),
  overview: z.string(),
  keywords: z.array(z.string()).max(SUMMARY_LIMITS.keywords).default([]),
  notes: z.array(noteSectionSchema).max(SUMMARY_LIMITS.sections).default([]),
  keyTakeaways: z.array(z.string()).max(SUMMARY_LIMITS.keyTakeaways),
  decisions: z.array(z.string()).max(SUMMARY_LIMITS.decisions),
  actionItems: z.array(actionItemSchema).max(SUMMARY_LIMITS.actionItems),
});
export type Summary = z.output<typeof summarySchema>;
/** Rows written before notes existed lack the defaulted fields. */
export type StoredSummary = z.input<typeof summarySchema>;

export const audioUrlSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type AudioUrl = z.infer<typeof audioUrlSchema>;

const timestamp = z.iso.datetime();
const MAX_DURATION_SECONDS = 24 * 60 * 60;

export const meetingSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleEdited: z.boolean(),
  status: meetingStatus,
  source,
  audioPathname: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  durationSeconds: z.number().nullable(),
  language: z.string().nullable(),
  transcriptText: z.string().nullable(),
  transcriptSegments: z.array(segmentSchema).nullable(),
  transcriptTruncated: z.boolean(),
  sttProvider: z.string().nullable(),
  summary: summarySchema.nullable(),
  errorStep: errorStep.nullable(),
  errorMessage: z.string().nullable(),
  errorRetryable: z.boolean().nullable(),
  attempts: z.number().int(),
  processingStartedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  stalled: z.boolean(),
});
export type Meeting = z.infer<typeof meetingSchema>;

export const meetingListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: meetingStatus,
  source,
  durationSeconds: z.number().nullable(),
  overviewSnippet: z.string().nullable(),
  actionItemCount: z.number().int(),
  stalled: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type MeetingListItem = z.infer<typeof meetingListItemSchema>;

export const createMeetingInputSchema = z.object({
  title: z.string().trim().max(120).optional(),
  audioPathname: z.string().regex(RECORDING_PATHNAME),
  contentType: z.string().refine(isAllowedAudioType, "Unsupported audio type"),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  source,
  durationSeconds: z
    .number()
    .nonnegative()
    .max(MAX_DURATION_SECONDS)
    .optional(),
});
export type CreateMeetingInput = z.infer<typeof createMeetingInputSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
