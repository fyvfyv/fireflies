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
import { type Recorder, useRecorder } from "@/features/recorder/useRecorder";
import { errorMessage, listMeetings } from "@/lib/api";

const LIST_POLL_MS = 5_000;

type ListState = {
  meetings: MeetingListItem[] | null;
  error: string | null;
};

// An `uploaded` row only moves once someone opens it, so it isn't polled.
const isProcessing = (m: MeetingListItem) =>
  isInProgress(m.status) && !m.stalled;

function useMeetingList() {
  const [state, setState] = useState<ListState>({
    meetings: null,
    error: null,
  });

  const load = useCallback(async () => {
    try {
      const meetings = await listMeetings();
      setState({ meetings, error: null });
    } catch (err) {
      // Keep the last rows on screen; a failed refetch is usually transient.
      setState((prev) => ({ ...prev, error: errorMessage(err) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every load replaces `state`, so this re-arms after each response and never
  // stacks requests behind a slow one the way setInterval would.
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

// In-app links would unmount the recorder and silently drop the audio;
// the recorder's beforeunload guard only covers closing or reloading the tab.
function useLeaveGuard(shouldBlock: BlockerFunction) {
  const blocker = useBlocker(shouldBlock);
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
  // A dropped file that failed validation; a picker shows its own, next to
  // its button.
  const [dropError, setDropError] = useState<string | null>(null);
  const { state } = recorder;
  const unsaved = state === "recording" || state === "stopped";
  const { isOwnNavigation, clear, submit: runSubmit } = submission;
  // Only the save's own move to the new meeting skips the prompt: leaving
  // mid-save would drop the recording, and a failure with it.
  useLeaveGuard(
    useCallback<BlockerFunction>(
      ({ nextLocation }) => unsaved && !isOwnNavigation(nextLocation.pathname),
      [unsaved, isOwnNavigation],
    ),
  );

  const submit = useCallback(
    (input: SubmitInput) => {
      setDropError(null);
      runSubmit(input);
    },
    [runSubmit],
  );
  // A failed file or sample save's Retry, or a stale drop message, would
  // otherwise linger next to a new recording or a newer file problem.
  const forgetFeedback = useCallback(() => {
    setDropError(null);
    clear();
  }, [clear]);
  // The feedback slot shows a save error in preference to a drop message, so
  // a newer bad drop has to replace the older failure to be seen at all.
  const rejectDrop = useCallback(
    (message: string) => {
      forgetFeedback();
      setDropError(message);
    },
    [forgetFeedback],
  );

  const phaseLabel = submission.phase
    ? phaseLabels[submission.phase]
    : undefined;
  const idle = state === "idle";
  // A drop navigates away once saved, which would drop a recording that is
  // starting, running or waiting to be saved.
  const dropDisabled = submission.busy || holdsMicrophone(state);

  return (
    <div className={tw("mx-auto max-w-[1120px] px-4 md:px-8")}>
      <DropZone
        onSubmit={submit}
        onReject={rejectDrop}
        disabled={dropDisabled}
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
              {/* Always mounted so screen readers announce each phase. The
                  review form shows the phase in its button, so the line is
                  only visible for saves started elsewhere. */}
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
          // The card offers these itself when the mic is unusable, and they
          // stay hidden mid-recording so a click can't navigate away from
          // unsaved audio.
          options={
            idle && (
              <MicFreeOptions
                onSubmit={submit}
                onReject={forgetFeedback}
                disabled={submission.busy}
              />
            )
          }
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
            idle && (
              <MicFreeOptions
                onSubmit={submit}
                onReject={forgetFeedback}
                disabled={submission.busy}
                label={null}
              />
            )
          }
        />
      </div>
    </div>
  );
}

// The recorder holds the microphone, or is about to.
function holdsMicrophone(state: Recorder["state"]): boolean {
  return state === "requesting" || state === "recording" || state === "stopped";
}
