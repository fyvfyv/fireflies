import type { MeetingListItem } from "@shared/schemas";
import { isInProgress } from "@shared/status";
import { tw } from "@tw";
import { useCallback, useEffect, useState } from "react";
import { type BlockerFunction, useBlocker } from "react-router";
import { ErrorAlert } from "@/components/ErrorAlert";
import { Spinner } from "@/components/ui/Spinner";
import { APP_TITLE, useDocumentTitle } from "@/components/useDocumentTitle";
import { DropZone } from "@/features/home/DropZone";
import { Hero } from "@/features/home/Hero";
import { MeetingList } from "@/features/meetings/MeetingList";
import { MicFreeOptions } from "@/features/meetings/MicFreeOptions";
import {
  type SubmitInput,
  type SubmitPhase,
  useSubmitRecording,
} from "@/features/meetings/useSubmitRecording";
import { RecorderCard } from "@/features/recorder/RecorderCard";
import { useRecorder } from "@/features/recorder/useRecorder";
import { errorMessage, listMeetings } from "@/lib/api";

const LIST_POLL_MS = 5_000;

// An `uploaded` row only moves once someone opens it, so it isn't polled.
const isProcessing = (m: MeetingListItem) =>
  isInProgress(m.status) && !m.stalled;

function useMeetingList() {
  const [state, setState] = useState<{
    meetings: MeetingListItem[] | null;
    error: string | null;
  }>({ meetings: null, error: null });

  const load = useCallback(async () => {
    try {
      const meetings = await listMeetings();
      setState({ meetings, error: null });
    } catch (err) {
      setState((prev) => ({ ...prev, error: errorMessage(err) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!state.meetings?.some(isProcessing)) return;
    const timer = setTimeout(load, LIST_POLL_MS);
    return () => clearTimeout(timer);
  }, [state, load]);

  return { ...state, reload: load };
}

const phaseLabels: Record<SubmitPhase, string> = {
  upload: "Uploading audio…",
  create: "Creating the meeting…",
};

const LEAVE_PROMPT = "Leave this page? The recording hasn't been saved.";

// beforeunload only covers tab close/reload; in-app links would unmount the recorder.
function useLeaveGuard(
  unsaved: boolean,
  isOwnNavigation: (pathname: string) => boolean,
) {
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ nextLocation }) => unsaved && !isOwnNavigation(nextLocation.pathname),
      [unsaved, isOwnNavigation],
    ),
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(LEAVE_PROMPT)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}

export function HomePage() {
  useDocumentTitle(APP_TITLE);
  const { meetings, error, reload } = useMeetingList();
  const recorder = useRecorder();
  const submission = useSubmitRecording();
  const [dropError, setDropError] = useState<string | null>(null);
  const { state } = recorder;
  const idle = state === "idle";
  const unsaved = state === "recording" || state === "stopped";
  useLeaveGuard(unsaved, submission.isOwnNavigation);

  const submit = (input: SubmitInput) => {
    setDropError(null);
    submission.submit(input);
  };
  const forgetFeedback = () => {
    setDropError(null);
    submission.clear();
  };
  const rejectDrop = (message: string) => {
    submission.clear();
    setDropError(message);
  };

  const phaseLabel = submission.phase
    ? phaseLabels[submission.phase]
    : undefined;
  const micFreeProps = {
    onSubmit: submit,
    onReject: forgetFeedback,
    disabled: submission.busy,
  };

  return (
    <div className={tw("mx-auto max-w-[1120px] px-4 md:px-8")}>
      <DropZone
        onSubmit={submit}
        onReject={rejectDrop}
        disabled={submission.busy || state === "requesting" || unsaved}
      />
      <div className={tw("pt-10 pb-12 md:pt-16 md:pb-16")}>
        <Hero
          recorder={
            <RecorderCard
              recorder={recorder}
              onSubmit={submit}
              onStart={forgetFeedback}
              onDiscard={forgetFeedback}
              onRejectFile={forgetFeedback}
              busy={submission.busy}
              phaseLabel={phaseLabel}
            />
          }
          feedback={
            <>
              {submission.error ? (
                <ErrorAlert
                  message={submission.error}
                  action={
                    submission.canRetry
                      ? { label: "Retry", onClick: submission.retry }
                      : undefined
                  }
                />
              ) : (
                dropError && <ErrorAlert message={dropError} />
              )}
              {/* Always mounted so screen readers announce each phase. */}
              <p
                role="status"
                className={tw(
                  state === "stopped" || !submission.busy
                    ? "sr-only"
                    : "flex items-center gap-2 px-1 type-small text-graphite",
                )}
              >
                {submission.busy && phaseLabel && (
                  <>
                    <Spinner />
                    {phaseLabel}
                  </>
                )}
              </p>
            </>
          }
          options={idle && <MicFreeOptions {...micFreeProps} />}
        />
      </div>
      <div className={tw("border-t border-rule pt-10 pb-16 md:pb-24")}>
        <MeetingList
          meetings={meetings}
          loading={!error}
          alert={
            error && (
              <ErrorAlert
                message={error}
                action={{ label: "Try again", onClick: reload }}
              />
            )
          }
          emptyActions={
            idle && <MicFreeOptions {...micFreeProps} label={null} />
          }
        />
      </div>
    </div>
  );
}
