import { extensionFor, MAX_RECORDING_MS } from "@shared/constants";
import { tw } from "@tw";
import { Clock, Download, MicOff, Square } from "lucide-react";
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { ClockDigits } from "@/components/ui/ClockDigits";
import { MicFreeOptions } from "@/features/meetings/MicFreeOptions";
import type { SubmitInput } from "@/features/meetings/useSubmitRecording";
import { formatDateTime, formatTimestamp } from "@/lib/time";
import type { CreateAnalyser } from "./audioAnalyser";
import { LiveWaveform, type WaveformMode } from "./LiveWaveform";
import type { Recorder, RecordingResult } from "./useRecorder";

type RecorderCardProps = {
  recorder: Recorder;
  onSubmit: (input: SubmitInput) => void;
  /** Called before the microphone is requested. */
  onStart?: () => void;
  /** Called after the recording is thrown away. */
  onDiscard?: () => void;
  /** Called when the card's upload option rejects a file. */
  onRejectFile?: (message: string) => void;
  /** A save (from here or a mic-free option) is running. */
  busy?: boolean;
  /** What the running save is doing, shown in the busy save button. */
  phaseLabel?: string;
  /** Passed to the waveform; tests use it to inject a fake analyser. */
  createAnalyser?: CreateAnalyser;
};

type RecorderState = Recorder["state"];
// States with a working microphone path; the rest explain what went wrong.
type UsableState = "idle" | "requesting" | "recording" | "stopped";
type UnusableState = Exclude<RecorderState, UsableState>;

const isUsable = (state: RecorderState): state is UsableState =>
  state === "idle" ||
  state === "requesting" ||
  state === "recording" ||
  state === "stopped";

const MAX_MINUTES = MAX_RECORDING_MS / 60_000;

const waveformModes: Record<UsableState, WaveformMode> = {
  idle: "idle",
  requesting: "idle",
  recording: "live",
  stopped: "frozen",
};

// A double click on Stop would otherwise land its second click on whatever
// replaced it.
const isRepeatClick = (event: MouseEvent) => event.detail > 1;

export function RecorderCard({
  recorder,
  onSubmit,
  onStart,
  onDiscard,
  onRejectFile,
  busy = false,
  phaseLabel,
  createAnalyser,
}: RecorderCardProps) {
  const { state } = recorder;
  const focus = useFocusHandoff(state);

  const start = (event: MouseEvent<HTMLButtonElement>) => {
    focus.handoff(event);
    onStart?.();
    recorder.start();
  };
  const stop = (event: MouseEvent<HTMLButtonElement>) => {
    if (isRepeatClick(event)) return;
    focus.handoff(event);
    recorder.stop();
  };
  const discard = (event: MouseEvent<HTMLButtonElement>) => {
    focus.handoff(event);
    recorder.reset();
    onDiscard?.();
  };

  return (
    <section
      aria-label="Recorder"
      className={tw("rounded-sheet border border-rule bg-sheet p-5 sm:p-6")}
    >
      {isUsable(state) ? (
        <>
          <StatusRow state={state} elapsed={recorder.elapsed} busy={busy} />
          {/* Stays mounted from idle to stopped so the final bars survive. */}
          <LiveWaveform
            stream={recorder.stream}
            mode={waveformModes[state]}
            createAnalyser={createAnalyser}
            className={tw("mt-4")}
          />
          <div className={tw("mt-5")}>
            {state === "recording" ? (
              <>
                <Button
                  key="stop"
                  ref={focus.setTarget}
                  size="lg"
                  onClick={stop}
                  className={tw("w-full")}
                >
                  <Square aria-hidden="true" size={14} fill="currentColor" />
                  Stop recording
                </Button>
                {recorder.warning ? (
                  <p
                    role="status"
                    className={tw("mt-3 flex items-start gap-2 type-small")}
                  >
                    <Clock
                      aria-hidden="true"
                      className={tw("mt-px shrink-0 text-danger")}
                    />
                    The recording stops automatically at {MAX_MINUTES} minutes.
                  </p>
                ) : (
                  <Hint>Nothing is uploaded until you save the recording.</Hint>
                )}
              </>
            ) : state === "stopped" && recorder.result ? (
              <ReviewForm
                result={recorder.result}
                onSubmit={onSubmit}
                onDiscard={discard}
                busy={busy}
                phaseLabel={phaseLabel}
                primaryRef={focus.setTarget}
              />
            ) : (
              <>
                {/* Busy, not disabled, while the permission prompt is open:
                    keyboard focus stays on the button. A file or sample save
                    disables it, since that save navigates away. */}
                <Button
                  key="start"
                  ref={focus.setTarget}
                  size="lg"
                  onClick={start}
                  busy={state === "requesting"}
                  disabled={busy}
                  className={tw("w-full")}
                >
                  {state === "requesting" ? (
                    "Waiting for microphone…"
                  ) : (
                    <>
                      <span
                        aria-hidden="true"
                        className={tw("size-2.5 rounded-full bg-rec")}
                      />
                      Start recording
                    </>
                  )}
                </Button>
                <Hint>
                  {state === "requesting"
                    ? "Allow microphone access in the browser prompt to start."
                    : "Your browser will ask for microphone access."}
                </Hint>
              </>
            )}
          </div>
        </>
      ) : (
        <Unavailable
          state={state}
          onSubmit={onSubmit}
          onRejectFile={onRejectFile}
          onRetry={start}
          busy={busy}
          focusRef={focus.setTarget}
        />
      )}
    </section>
  );
}

/**
 * Pressing Start, Try again, Stop or Discard removes the pressed button. When
 * it had focus, move focus to the control that replaces it instead of
 * dropping it on the page body.
 */
function useFocusHandoff(state: RecorderState) {
  const targetRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(false);

  const setTarget = useCallback((node: HTMLElement | null) => {
    targetRef.current = node;
  }, []);

  const handoff = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.currentTarget === document.activeElement) {
      pendingRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!pendingRef.current) return;
    const active = document.activeElement;
    const lost = active === null || active === document.body;
    if (state === "requesting") {
      // Start stays in place as the busy button, but Try again goes away
      // with its panel. Either way the handoff waits for the prompt's answer.
      if (lost) targetRef.current?.focus();
      return;
    }
    pendingRef.current = false;
    if (lost) targetRef.current?.focus();
  }, [state]);

  return { setTarget, handoff };
}

const statusLabels: Record<UsableState, string> = {
  idle: "Ready",
  requesting: "Ready",
  recording: "Recording",
  stopped: "Ready to save",
};

function StatusRow({
  state,
  elapsed,
  busy,
}: {
  state: UsableState;
  elapsed: number;
  busy: boolean;
}) {
  const recording = state === "recording";
  const hasTime = recording || state === "stopped";
  // The page's status line announces the save phases. "Saving" is only
  // drawn here, and the announced label keeps its node, so the live region
  // doesn't read the save out a second time.
  const saving = state === "stopped" && busy;
  return (
    <div className={tw("flex items-center justify-between gap-4")}>
      <p
        // Announces the switch to recording and back.
        aria-live="polite"
        className={tw(
          "flex items-center gap-2 type-small font-medium text-graphite",
        )}
      >
        <span
          aria-hidden="true"
          className={tw(
            "size-2.5 shrink-0 rounded-full",
            recording
              ? "animate-rec-pulse bg-rec"
              : hasTime
                ? "bg-ink"
                : "bg-faint",
          )}
        />
        <span className={tw(saving && "sr-only")}>{statusLabels[state]}</span>
        {saving && <span aria-hidden="true">Saving</span>}
      </p>
      <span
        role="timer"
        aria-label="Elapsed time"
        className={tw("type-timer", hasTime ? "text-ink" : "text-faint")}
      >
        <ClockDigits value={formatTimestamp(elapsed)} />
      </span>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className={tw("mt-3 type-small text-graphite")}>{children}</p>;
}

function ReviewForm({
  result,
  onSubmit,
  onDiscard,
  busy,
  phaseLabel,
  primaryRef,
}: {
  result: RecordingResult;
  onSubmit: (input: SubmitInput) => void;
  onDiscard: (event: MouseEvent<HTMLButtonElement>) => void;
  busy: boolean;
  phaseLabel?: string;
  primaryRef: (node: HTMLElement | null) => void;
}) {
  const titleId = useId();
  const hintId = useId();
  const [title, setTitle] = useState("");
  const [placeholder] = useState(
    () => `Recording ${formatDateTime(new Date())}`,
  );
  const downloadUrl = useObjectUrl(result.blob);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onSubmit({
      ...result,
      title: title.trim() || undefined,
      source: "mic",
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label
        htmlFor={titleId}
        className={tw("block type-small font-medium text-graphite")}
      >
        Title
      </label>
      <input
        id={titleId}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={placeholder}
        maxLength={120}
        autoComplete="off"
        disabled={busy}
        aria-describedby={hintId}
        className={tw(
          "mt-1.5 h-10 w-full rounded-control border border-rule bg-sheet px-3 text-ink transition-colors",
          // A flush 2px ink edge instead of the global offset outline, which
          // framed the bordered field twice while typing. outline-hidden (not
          // none) keeps a transparent outline that forced-colors mode paints,
          // since it drops the ring and recolours the border there.
          "hover:border-faint focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink focus-visible:outline-hidden disabled:opacity-60",
        )}
      />
      <p id={hintId} className={tw("mt-1.5 type-caption text-graphite")}>
        Leave empty to use a title from the notes.
      </p>
      <Button
        key="save"
        ref={primaryRef}
        type="submit"
        size="lg"
        busy={busy}
        onClick={(event) => {
          if (isRepeatClick(event)) event.preventDefault();
        }}
        className={tw("mt-5 w-full")}
      >
        {busy ? (phaseLabel ?? "Saving…") : "Save and transcribe"}
      </Button>
      <div className={tw("mt-2 flex flex-wrap gap-2")}>
        <Button
          variant="secondary"
          onClick={onDiscard}
          disabled={busy}
          className={tw("flex-1 sm:flex-none")}
        >
          Discard
        </Button>
        {downloadUrl && (
          <Button asChild variant="ghost" className={tw("flex-1 sm:flex-none")}>
            <a
              href={downloadUrl}
              download={`recording.${extensionFor(result.contentType)}`}
            >
              <Download aria-hidden="true" />
              Download audio
            </a>
          </Button>
        )}
      </div>
    </form>
  );
}

const unavailableCopy: Record<UnusableState, { title: string; body: string }> =
  {
    denied: {
      title: "Microphone access is blocked",
      body: "Allow microphone access in your browser's site settings, then reload the page.",
    },
    unavailable: {
      title: "Couldn't start the microphone",
      body: "Check that a microphone is connected and not in use by another app.",
    },
    unsupported: {
      title: "Recording isn't available in this browser",
      body: "Use a recent Chrome, Edge, Firefox or Safari over HTTPS.",
    },
  };

function Unavailable({
  state,
  onSubmit,
  onRejectFile,
  onRetry,
  busy,
  focusRef,
}: {
  state: UnusableState;
  onSubmit: (input: SubmitInput) => void;
  onRejectFile?: (message: string) => void;
  onRetry: (event: MouseEvent<HTMLButtonElement>) => void;
  busy: boolean;
  focusRef: (node: HTMLElement | null) => void;
}) {
  const copy = unavailableCopy[state];
  const canRetry = state === "unavailable";
  return (
    <div>
      {/* Receives focus after a refused start, so the explanation is read. */}
      <div
        ref={canRetry ? undefined : focusRef}
        tabIndex={-1}
        className={tw("flex items-start gap-3 rounded-md focus:outline-none")}
      >
        <span
          aria-hidden="true"
          className={tw(
            "grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-graphite",
          )}
        >
          <MicOff size={18} />
        </span>
        <div className={tw("min-w-0 pt-0.5")}>
          <p className={tw("type-heading")}>{copy.title}</p>
          <p className={tw("mt-1 text-pretty type-small text-graphite")}>
            {copy.body}
          </p>
        </div>
      </div>
      {canRetry && (
        <Button
          ref={focusRef}
          variant="secondary"
          onClick={onRetry}
          disabled={busy}
          className={tw("mt-4")}
        >
          Try again
        </Button>
      )}
      <MicFreeOptions
        onSubmit={onSubmit}
        onReject={onRejectFile}
        disabled={busy}
        className={tw("mt-5 border-t border-rule pt-5")}
      />
    </div>
  );
}

function useObjectUrl(blob: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
