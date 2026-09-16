import type { MeetingRow } from "../db/schema.js";

export type { MeetingRow };

export type NewMeeting = Pick<
  MeetingRow,
  | "title"
  | "titleEdited"
  | "source"
  | "audioPathname"
  | "contentType"
  | "sizeBytes"
  | "durationSeconds"
  | "createdIpHash"
>;

export type MeetingPatch = Partial<
  Omit<
    MeetingRow,
    "id" | "createdAt" | "updatedAt" | "createdIpHash" | "deletedAt"
  >
>;

type MeetingListRow = Pick<
  MeetingRow,
  | "id"
  | "title"
  | "status"
  | "source"
  | "durationSeconds"
  | "processingStartedAt"
  | "createdAt"
  | "updatedAt"
> & { overviewSnippet: string | null; actionItemCount: number };

export const OVERVIEW_SNIPPET_LENGTH = 140;
export const LIST_LIMIT = 50;

export const DELETED_CONTENT = {
  title: "",
  language: null,
  transcriptText: null,
  transcriptSegments: null,
  summary: null,
  errorMessage: null,
} satisfies MeetingPatch;

export type MeetingRepo = {
  create(meeting: NewMeeting): Promise<MeetingRow>;
  // Deleted rows are hidden from every method but countCreatedSince, so deleting never frees rate-limit quota.
  get(id: string): Promise<MeetingRow | null>;
  list(): Promise<MeetingListRow[]>;
  /** With `lease`, writes only while it is still held, so a taken-over run can't overwrite its successor. */
  update(
    id: string,
    patch: MeetingPatch,
    lease?: Date,
  ): Promise<MeetingRow | null>;
  delete(id: string): Promise<boolean>;
  countCreatedSince(since: Date, ipHash?: string): Promise<number>;
  claimLease(
    id: string,
    now: Date,
    leaseMs: number,
  ): Promise<MeetingRow | null>;
  /** One atomic write, so reopening can't race a run or clear notes saved since the caller's read. */
  reopenLegacySummary(
    id: string,
    now: Date,
    leaseMs: number,
    patch: MeetingPatch,
  ): Promise<MeetingRow | null>;
  releaseLease(
    id: string,
    lease: Date,
    patch: MeetingPatch,
  ): Promise<MeetingRow | null>;
};
