import type { Meeting } from "@shared/schemas";
import { tw } from "@tw";
import { type ReactNode, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/BackLink";
import { ErrorAlert } from "@/components/ErrorAlert";
import { DeleteMeetingButton } from "@/features/meetings/DeleteMeetingButton";
import { FailedBanner } from "@/features/meetings/FailedBanner";
import { sourceLabels } from "@/features/meetings/MeetingList";
import { StatusStepper } from "@/features/meetings/StatusStepper";
import { SummaryPanel } from "@/features/meetings/SummaryPanel";
import { TranscriptPanel } from "@/features/meetings/TranscriptPanel";
import { useAutoProcess } from "@/features/meetings/useAutoProcess";
import { useMeeting } from "@/features/meetings/useMeeting";
import {
  ApiError,
  deleteMeeting,
  errorMessage,
  processMeeting,
} from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/time";

const isApiStatus = (err: unknown, status: number) =>
  err instanceof ApiError && err.status === status;

export function MeetingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // The retry request only returns when the run ends (up to 300 s), so the
  // page polls meanwhile to show the steps as they happen.
  const { meeting, notFound, error, refetch } = useMeeting(id, {
    keepPolling: retrying,
  });
  const startError = useAutoProcess(meeting, refetch);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await processMeeting(id);
    } catch (err) {
      // 409: another tab already restarted the run, and polling shows it.
      if (!isApiStatus(err, 409)) setRetryError(errorMessage(err));
    }
    await refetch();
    setRetrying(false);
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMeeting(id);
    } catch (err) {
      if (!isApiStatus(err, 404)) {
        setDeleteError(errorMessage(err));
        setDeleting(false);
        return;
      }
    }
    // Replaced so Back doesn't return to a page that no longer exists.
    navigate("/", { replace: true });
  };

  if (notFound) {
    return (
      <PageShell>
        <div className={tw("space-y-2 rounded-lg border p-6 text-center")}>
          <h1 className={tw("text-title font-semibold")}>Meeting not found</h1>
          <p className={tw("text-body text-neutral-600")}>
            It may have been deleted, or the link is incomplete.
          </p>
        </div>
      </PageShell>
    );
  }

  if (!meeting) {
    return (
      <PageShell>
        {error ? (
          <ErrorAlert
            message={error}
            action={{ label: "Try again", onClick: refetch }}
          />
        ) : (
          <MeetingSkeleton />
        )}
      </PageShell>
    );
  }

  const showBanner = meeting.status === "failed" || meeting.stalled;
  // Nothing else would start a meeting whose automatic start failed.
  const waitingError =
    !showBanner && meeting.status === "uploaded"
      ? (retryError ?? startError)
      : null;

  return (
    <PageShell>
      <header className={tw("space-y-2")}>
        <div className={tw("flex flex-wrap items-start justify-between gap-3")}>
          <h1 className={tw("text-title font-semibold break-words")}>
            {meeting.title}
          </h1>
          <DeleteMeetingButton onConfirm={remove} deleting={deleting} />
        </div>
        <MeetingMeta meeting={meeting} />
      </header>
      {deleteError && <ErrorAlert message={deleteError} />}
      {error && (
        <ErrorAlert
          message={error}
          action={{ label: "Try again", onClick: refetch }}
        />
      )}
      <StatusStepper meeting={meeting} />
      {waitingError && (
        <ErrorAlert
          message={waitingError}
          action={retrying ? undefined : { label: "Retry", onClick: retry }}
        />
      )}
      {showBanner && (
        <FailedBanner
          meeting={meeting}
          onRetry={retry}
          onDelete={remove}
          retrying={retrying}
          retryError={retryError}
          deleting={deleting}
        />
      )}
      <div className={tw("grid gap-4 md:grid-cols-2 md:items-start")}>
        <SummaryPanel
          summary={meeting.summary}
          truncated={meeting.transcriptTruncated}
        />
        <TranscriptPanel
          text={meeting.transcriptText}
          segments={meeting.transcriptSegments}
        />
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className={tw("space-y-6")}>
      <BackLink />
      {children}
    </div>
  );
}

const languageNames = new Intl.DisplayNames("en", { type: "language" });

// Whisper-style providers may report a lowercase name ("english") instead of
// a code, which DisplayNames returns unchanged or rejects.
function languageName(language: string): string {
  try {
    const name = languageNames.of(language);
    if (name && name !== language) return name;
  } catch {
    // Not a valid language tag; fall back to what the provider reported.
  }
  return language.charAt(0).toUpperCase() + language.slice(1);
}

function MeetingMeta({ meeting }: { meeting: Meeting }) {
  const parts = [
    sourceLabels[meeting.source],
    meeting.durationSeconds === null
      ? null
      : formatDuration(meeting.durationSeconds),
    meeting.language ? languageName(meeting.language) : null,
    formatDateTime(new Date(meeting.createdAt)),
    meeting.sttProvider ? `Speech-to-text: ${meeting.sttProvider}` : null,
  ].filter((part) => part !== null);

  return (
    <div
      className={tw(
        "flex flex-wrap gap-x-3 gap-y-1 text-caption text-neutral-500",
      )}
    >
      {parts.map((part) => (
        <span key={part}>{part}</span>
      ))}
    </div>
  );
}

function MeetingSkeleton() {
  return (
    <div aria-busy="true" className={tw("space-y-4")}>
      <p className={tw("sr-only")}>Loading meeting…</p>
      <div aria-hidden className={tw("animate-pulse space-y-4")}>
        <div className={tw("h-8 w-2/3 rounded bg-neutral-200")} />
        <div className={tw("h-4 w-1/2 rounded bg-neutral-100")} />
        <div className={tw("grid gap-4 md:grid-cols-2")}>
          <div className={tw("h-48 rounded-lg bg-neutral-100")} />
          <div className={tw("h-48 rounded-lg bg-neutral-100")} />
        </div>
      </div>
    </div>
  );
}
