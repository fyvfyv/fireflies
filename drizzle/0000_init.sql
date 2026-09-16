CREATE TYPE "public"."error_step" AS ENUM('transcribe', 'summarize');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('uploaded', 'transcribing', 'transcribed', 'summarizing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_edited" boolean DEFAULT false NOT NULL,
	"status" "meeting_status" NOT NULL,
	"source" text NOT NULL,
	"audio_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" real,
	"language" text,
	"transcript_text" text,
	"transcript_segments" jsonb,
	"transcript_truncated" boolean DEFAULT false NOT NULL,
	"stt_provider" text,
	"summary" jsonb,
	"error_step" "error_step",
	"error_message" text,
	"error_retryable" boolean,
	"attempts" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"created_ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meetings_created_at_idx" ON "meetings" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meetings_ip_hash_created_at_idx" ON "meetings" USING btree ("created_ip_hash","created_at");