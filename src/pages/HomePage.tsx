import type { MeetingListItem } from "@shared/schemas";
import { isInProgress } from "@shared/status";
import { tw } from "@tw";
import { useCallback, useEffect, useState } from "react";
import { type BlockerFunction, useBlocker } from "react-router";
import { ErrorAlert } from "@/components/ErrorAlert";
import { MeetingList } from "@/features/meetings/MeetingList";
import { MicFreeOptions } from "@/features/meetings/MicFreeOptions";
import {
  type SubmitPhase,
  useSubmitRecording,
} from "@/features/meetings/useSubmitRecording";
import { RecorderCard } from "@/features/recorder/RecorderCard";
import { useRecorder } from "@/features/recorder/useRecorder";
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
  const { meetings, error, reload } = useMeetingList();
  const recorder = useRecorder();
  const submission = useSubmitRecording();
  const unsaved =
    recorder.state === "recording" || recorder.state === "stopped";
  const { isOwnNavigation, clear } = submission;
  // Only the save's own move to the new meeting skips the prompt: leaving
  // mid-save would drop the recording, and a failure with it.
  useLeaveGuard(
    useCallback<BlockerFunction>(
      ({ nextLocation }) => unsaved && !isOwnNavigation(nextLocation.pathname),
      [unsaved, isOwnNavigation],
    ),
  );

  return (
    <div className={tw("space-y-8")}>
      <section
        aria-labelledby="new-recording-heading"
        className={tw("space-y-3")}
      >
        <h1
          id="new-recording-heading"
          className={tw("text-title font-semibold")}
        >
          New recording
        </h1>
        <p className={tw("text-body text-neutral-600")}>
          Record a meeting in your browser and get a transcript, summary,
          decisions and action items.
        </p>
        <RecorderCard
          recorder={recorder}
          onSubmit={submission.submit}
          // A failed file or sample save's Retry would navigate away from
          // the new recording.
          onStart={clear}
          onDiscard={clear}
          busy={submission.busy}
        />
        {/* The card offers these itself when the mic is unusable, and they stay
            hidden mid-recording so a click can't navigate away from unsaved audio. */}
        {recorder.state === "idle" && (
          <MicFreeOptions
            onSubmit={submission.submit}
            disabled={submission.busy}
          />
        )}
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
          submission.busy &&
          submission.phase && (
            <p role="status" className={tw("text-body text-neutral-600")}>
              {phaseLabels[submission.phase]}
            </p>
          )
        )}
      </section>

      <section aria-labelledby="meetings-heading" className={tw("space-y-3")}>
        <h2 id="meetings-heading" className={tw("font-semibold")}>
          Meetings
        </h2>
        {error && (
          <ErrorAlert
            message={error}
            action={{ label: "Try again", onClick: reload }}
          />
        )}
        {meetings ? (
          <MeetingList meetings={meetings} />
        ) : (
          !error && (
            <p className={tw("text-body text-neutral-500")}>
              Loading meetings…
            </p>
          )
        )}
      </section>
    </div>
  );
}
