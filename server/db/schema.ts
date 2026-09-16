import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  ERROR_STEPS,
  MEETING_STATUSES,
  type Segment,
  SOURCES,
  type StoredSummary,
} from "../../shared/schemas.js";

export const meetingStatusEnum = pgEnum("meeting_status", MEETING_STATUSES);
export const errorStepEnum = pgEnum("error_step", ERROR_STEPS);

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleEdited: boolean("title_edited").notNull().default(false),
    status: meetingStatusEnum("status").notNull(),
    source: text("source", { enum: SOURCES }).notNull(),
    audioPathname: text("audio_pathname").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: real("duration_seconds"),
    language: text("language"),
    transcriptText: text("transcript_text"),
    transcriptSegments: jsonb("transcript_segments").$type<Segment[]>(),
    transcriptTruncated: boolean("transcript_truncated")
      .notNull()
      .default(false),
    sttProvider: text("stt_provider"),
    summary: jsonb("summary").$type<StoredSummary>(),
    errorStep: errorStepEnum("error_step"),
    errorMessage: text("error_message"),
    errorRetryable: boolean("error_retryable"),
    attempts: integer("attempts").notNull().default(0),
    processingStartedAt: timestamptz("processing_started_at"),
    createdIpHash: text("created_ip_hash"),
    deletedAt: timestamptz("deleted_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("meetings_created_at_idx").on(t.createdAt.desc()),
    index("meetings_ip_hash_created_at_idx").on(t.createdIpHash, t.createdAt),
  ],
);

export type MeetingRow = typeof meetings.$inferSelect;
