import { extensionFor, MAX_RECORDING_MS } from "@shared/constants";
import { tw } from "@tw";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { MicFreeOptions } from "@/features/meetings/MicFreeOptions";
import type { SubmitInput } from "@/features/meetings/useSubmitRecording";
import { formatDateTime, formatTimestamp } from "@/lib/time";
import type { Recorder, RecordingResult } from "./useRecorder";

type RecorderCardProps = {
  recorder: Recorder;
  onSubmit: (input: SubmitInput) => void;
  // Called before the microphone is requested.
  onStart?: () => void;
  // Called after the recording is thrown away.
  onDiscard?: () => void;
  busy?: boolean;
};

export function RecorderCard({
  recorder,
  onSubmit,
  onStart,
  onDiscard,
  busy = false,
}: RecorderCardProps) {
  const start = () => {
    onStart?.();
    recorder.start();
  };
  const discard = () => {
    recorder.reset();
    onDiscard?.();
  };
  return (
    <div className={tw("rounded-lg border p-4")}>
      <RecorderBody
        recorder={recorder}
        onSubmit={onSubmit}
        onStart={start}
        onDiscard={discard}
        busy={busy}
      />
    </div>
  );
}

function RecorderBody({
  recorder,
  onSubmit,
  onStart,
  onDiscard,
  busy,
}: Required<RecorderCardProps>) {
  switch (recorder.state) {
    case "idle":
    case "requesting":
      return (
        <div
          className={tw("flex flex-wrap items-center justify-between gap-3")}
        >
          <p className={tw("text-body text-neutral-600")}>
            {recorder.state === "requesting"
              ? "Allow microphone access in your browser to start."
              : "Nothing is uploaded until you save the recording."}
          </p>
          {/* A file or sample upload navigates away when it finishes, which
              would drop a recording started in the meantime. */}
          <Button
            onClick={onStart}
            disabled={busy || recorder.state === "requesting"}
          >
            <span
              aria-hidden
              className={tw("size-2.5 rounded-full bg-red-500")}
            />
            Start recording
          </Button>
        </div>
      );
    case "recording":
      return <RecordingView recorder={recorder} />;
    case "stopped":
      return (
        recorder.result && (
          <ReviewForm
            result={recorder.result}
            onSubmit={onSubmit}
            onDiscard={onDiscard}
            busy={busy}
          />
        )
      );
    case "denied":
      return (
        <Unavailable
          title="Microphone access is blocked"
          onSubmit={onSubmit}
          busy={busy}
        >
          Allow microphone access in your browser's site settings, then reload
          the page.
        </Unavailable>
      );
    case "unavailable":
      return (
        <Unavailable
          title="Couldn't start the microphone"
          onSubmit={onSubmit}
          busy={busy}
          action={
            <Button variant="secondary" onClick={onStart} disabled={busy}>
              Try again
            </Button>
          }
        >
          Check that a microphone is connected and not in use by another app.
        </Unavailable>
      );
    case "unsupported":
      return (
        <Unavailable
          title="Recording isn't available in this browser"
          onSubmit={onSubmit}
          busy={busy}
        >
          Use a recent Chrome, Edge, Firefox or Safari over HTTPS.
        </Unavailable>
      );
  }
}

const MAX_MINUTES = MAX_RECORDING_MS / 60_000;

function RecordingView({ recorder }: { recorder: Recorder }) {
  return (
    <div className={tw("space-y-3")}>
      <div className={tw("flex flex-wrap items-center justify-between gap-3")}>
        <div className={tw("flex items-center gap-2")}>
          <span
            aria-hidden
            className={tw("size-2.5 animate-pulse rounded-full bg-red-500")}
          />
          <span className={tw("font-medium")}>Recording</span>
          <span
            role="timer"
            aria-label="Elapsed time"
            className={tw("tabular-nums text-neutral-600")}
          >
            {formatTimestamp(recorder.elapsed)}
          </span>
        </div>
        <Button variant="danger" onClick={recorder.stop}>
          Stop recording
        </Button>
      </div>
      {recorder.warning && (
        <p
          role="status"
          className={tw("rounded-md bg-amber-50 p-3 text-body text-amber-900")}
        >
          The recording stops automatically at {MAX_MINUTES} minutes.
        </p>
      )}
    </div>
  );
}

function ReviewForm({
  result,
  onSubmit,
  onDiscard,
  busy,
}: {
  result: RecordingResult;
  onSubmit: (input: SubmitInput) => void;
  onDiscard: () => void;
  busy: boolean;
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
    onSubmit({
      ...result,
      title: title.trim() || undefined,
      source: "mic",
    });
  };

  return (
    <form onSubmit={handleSubmit} className={tw("space-y-3")}>
      <p className={tw("font-medium")}>
        Recorded {formatTimestamp(result.durationSeconds)}
      </p>
      <div className={tw("space-y-1")}>
        <label htmlFor={titleId} className={tw("block text-body font-medium")}>
          Title
        </label>
        <input
          id={titleId}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder}
          maxLength={120}
          disabled={busy}
          aria-describedby={hintId}
          className={tw(
            "w-full rounded-md border border-neutral-300 px-3 py-2 text-body",
            "focus-visible:outline-2 focus-visible:outline-neutral-900",
          )}
        />
        <p id={hintId} className={tw("text-caption text-neutral-500")}>
          Leave empty to use a title from the summary.
        </p>
      </div>
      <div className={tw("flex flex-wrap items-center gap-2")}>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save & transcribe"}
        </Button>
        <Button variant="secondary" onClick={onDiscard} disabled={busy}>
          Discard
        </Button>
        {downloadUrl && (
          <Button asChild variant="ghost">
            <a
              href={downloadUrl}
              download={`recording.${extensionFor(result.contentType)}`}
            >
              Download recording
            </a>
          </Button>
        )}
      </div>
    </form>
  );
}

function Unavailable({
  title,
  children,
  action,
  onSubmit,
  busy,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  onSubmit: (input: SubmitInput) => void;
  busy: boolean;
}) {
  return (
    <div className={tw("space-y-2")}>
      <p className={tw("font-medium")}>{title}</p>
      <p className={tw("text-body text-neutral-600")}>{children}</p>
      {action}
      <MicFreeOptions onSubmit={onSubmit} disabled={busy} />
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
