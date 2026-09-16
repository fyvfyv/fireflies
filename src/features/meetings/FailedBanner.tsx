import { MAX_ATTEMPTS } from "@shared/constants";
import type { Meeting } from "@shared/schemas";
import { tw } from "@tw";
import { CircleAlert, CirclePause, RotateCw } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { DeleteMeetingButton } from "./DeleteMeetingButton";

type BannerMeeting = Pick<
  Meeting,
  | "status"
  | "errorStep"
  | "errorMessage"
  | "errorRetryable"
  | "attempts"
  | "stalled"
>;

type FailedBannerProps = {
  meeting: BannerMeeting;
  onRetry: () => void;
  onDelete: () => void;
  retrying?: boolean;
  retryError?: string | null;
  deleting?: boolean;
  deleteError?: string | null;
  className?: string;
};

function copy({ status, errorStep }: BannerMeeting) {
  if (status !== "failed") {
    return {
      title: "Processing was interrupted",
      detail:
        "The server stopped before finishing. Retry to pick up where it left off.",
    };
  }
  if (errorStep === "summarize") {
    return {
      title: "Couldn't write the notes",
      detail: "The transcript is saved, so a retry only redoes the notes.",
    };
  }
  return { title: "Couldn't transcribe the recording", detail: null };
}

export function FailedBanner({
  meeting,
  onRetry,
  onDelete,
  retrying = false,
  retryError = null,
  deleting = false,
  deleteError = null,
  className,
}: FailedBannerProps) {
  const headingId = useId();
  const { title, detail } = copy(meeting);
  const exhausted = meeting.attempts >= MAX_ATTEMPTS;
  const retryable =
    !exhausted && (meeting.stalled || meeting.errorRetryable !== false);
  const Icon = meeting.status === "failed" ? CircleAlert : CirclePause;

  return (
    <section
      aria-labelledby={headingId}
      className={tw(
        "flex gap-3 rounded-control border border-danger/40 bg-sheet p-4",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        size={20}
        className={tw("mt-0.5 shrink-0 text-danger")}
      />
      <div className={tw("min-w-0 flex-1 space-y-1")}>
        <h2 id={headingId} className={tw("type-body font-semibold text-ink")}>
          {title}
        </h2>
        {meeting.errorMessage && (
          <p className={tw("type-small text-ink")}>{meeting.errorMessage}</p>
        )}
        {retryable && detail && (
          <p className={tw("type-small text-graphite")}>{detail}</p>
        )}
        {!retryable && (
          <p className={tw("type-small text-graphite")}>
            {exhausted
              ? `This recording failed ${MAX_ATTEMPTS} times, so it won't be retried again.`
              : "Retrying won't fix this recording."}{" "}
            Delete it and upload the audio again.
          </p>
        )}
        {retryError && (
          <p role="alert" className={tw("type-small font-medium text-danger")}>
            {retryError}
          </p>
        )}
        <div className={tw("pt-2")}>
          {retryable ? (
            <Button size="sm" busy={retrying} onClick={onRetry}>
              {!retrying && <RotateCw aria-hidden="true" />}
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          ) : (
            <DeleteMeetingButton
              label="Delete and re-upload"
              onConfirm={onDelete}
              deleting={deleting}
              error={deleteError}
            />
          )}
        </div>
      </div>
    </section>
  );
}
