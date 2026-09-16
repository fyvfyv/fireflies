import { tw } from "@tw";
import { Play } from "lucide-react";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SubmitInput } from "./useSubmitRecording";

type TrySampleButtonProps = {
  onSubmit: (input: SubmitInput) => void;
  disabled?: boolean;
  className?: string;
};

const SAMPLE_URL = "/samples/standup.webm";
const SAMPLE_TYPE = "audio/webm";
const SAMPLE_TITLE = "Sample: weekly standup";

async function fetchSample(signal: AbortSignal): Promise<Blob> {
  const res = await fetch(SAMPLE_URL, { signal });
  if (!res.ok) throw new Error(`Sample request failed (${res.status})`);
  const blob = await res.blob();
  // The SPA fallback answers a missing file with index.html and a 200.
  if (blob.type.startsWith("text/html")) throw new Error("Sample is missing");
  return blob;
}

export function TrySampleButton({
  onSubmit,
  disabled = false,
  className,
}: TrySampleButtonProps) {
  const errorId = useId();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // The button unmounts when a recording starts; a sample submitted after
  // that would navigate away from the recording.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    // The button can appear under the pointer between the two clicks of a
    // double click on the recorder (Discard). Keyboard activation reports 0.
    if (event.detail > 1) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    let blob: Blob;
    try {
      blob = await fetchSample(controller.signal);
    } catch {
      if (!controller.signal.aborted) {
        setError("Couldn't load the sample recording. Please try again.");
      }
      return;
    } finally {
      setLoading(false);
    }
    if (controller.signal.aborted) return;
    onSubmit({
      blob,
      // Explicit, because static hosts may serve .webm as video/webm.
      contentType: SAMPLE_TYPE,
      source: "demo",
      title: SAMPLE_TITLE,
    });
  };

  return (
    <div className={tw("flex flex-col gap-1.5")}>
      <Button
        variant="secondary"
        onClick={handleClick}
        disabled={disabled}
        busy={loading}
        aria-describedby={error ? errorId : undefined}
        className={className}
      >
        {!loading && <Play aria-hidden="true" />}
        {loading ? "Loading sample…" : "Try a 2-minute sample"}
      </Button>
      {error && (
        <p
          id={errorId}
          role="alert"
          className={tw("max-w-xs text-pretty type-caption text-danger")}
        >
          {error}
        </p>
      )}
    </div>
  );
}
