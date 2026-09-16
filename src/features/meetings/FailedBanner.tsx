import { MAX_ATTEMPTS } from "@shared/constants";
import type { Meeting } from "@shared/schemas";
import { tw } from "@tw";
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
      title: "Couldn't write the summary",
      detail: "The transcript is saved, so a retry only redoes the summary.",
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
}: FailedBannerProps) {
  const headingId = useId();
  const { title, detail } = copy(meeting);
  const exhausted = meeting.attempts >= MAX_ATTEMPTS;
  const retryable =
    !exhausted && (meeting.stalled || meeting.errorRetryable !== false);

  return (
    <section
      aria-labelledby={headingId}
      className={tw(
        "space-y-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900",
      )}
    >
      <h2 id={headingId} className={tw("font-semibold")}>
        {title}
      </h2>
      {meeting.errorMessage && (
        <p className={tw("text-body")}>{meeting.errorMessage}</p>
      )}
      {retryable && detail && <p className={tw("text-body")}>{detail}</p>}
      {!retryable && (
        <p className={tw("text-body")}>
          {exhausted
            ? `This recording failed ${MAX_ATTEMPTS} times, so it won't be retried again.`
            : "Retrying won't fix this recording."}{" "}
          Delete it and upload the audio again.
        </p>
      )}
      {retryError && (
        <p role="alert" className={tw("text-body font-medium")}>
          {retryError}
        </p>
      )}
      <div className={tw("pt-1")}>
        {retryable ? (
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        ) : (
          <DeleteMeetingButton
            label="Delete and re-upload"
            onConfirm={onDelete}
            deleting={deleting}
          />
        )}
      </div>
    </section>
  );
}
