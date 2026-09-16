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

// What a delete wipes from the row it keeps for rate limiting.
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
  // Deleted meetings are invisible to every method except countCreatedSince.
  get(id: string): Promise<MeetingRow | null>;
  /** Newest first, at most LIST_LIMIT rows. */
  list(): Promise<MeetingListRow[]>;
  /**
   * With `lease`, writes only while the meeting still holds that lease, so a
   * run that was taken over can't overwrite its successor's progress.
   */
  update(
    id: string,
    patch: MeetingPatch,
    lease?: Date,
  ): Promise<MeetingRow | null>;
  /** Soft delete: wipes DELETED_CONTENT and hides the row. */
  delete(id: string): Promise<boolean>;
  /** Counts deleted meetings too, so deleting never frees rate-limit quota. */
  countCreatedSince(since: Date, ipHash?: string): Promise<number>;
  /**
   * Atomically takes the processing lease: succeeds only when the meeting is
   * not done and has no lease younger than `leaseMs`. Null means someone else
   * holds it (or the meeting is gone or done).
   */
  claimLease(
    id: string,
    now: Date,
    leaseMs: number,
  ): Promise<MeetingRow | null>;
  /** Null unless the meeting still holds `lease`. */
  releaseLease(
    id: string,
    lease: Date,
    patch: MeetingPatch,
  ): Promise<MeetingRow | null>;
};
