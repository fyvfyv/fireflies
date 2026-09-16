import {
  ALLOWED_AUDIO_TYPES,
  isAllowedAudioType,
  MAX_AUDIO_BYTES,
} from "@shared/constants";
import { tw } from "@tw";
import { Upload } from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SubmitInput } from "./useSubmitRecording";

type UploadAudioButtonProps = {
  onSubmit: (input: SubmitInput) => void;
  onReject?: (message: string) => void;
  disabled?: boolean;
  className?: string;
};

// Browsers report .webm as video/webm, legacy WAV/MP3 aliases, or no type.
const TYPE_ALIASES: Record<string, string> = {
  "video/webm": "audio/webm",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/mp3": "audio/mpeg",
};
const EXTENSION_TYPES: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};
const ACCEPT = [
  ...ALLOWED_AUDIO_TYPES,
  ...Object.keys(TYPE_ALIASES),
  ...Object.keys(EXTENSION_TYPES).map((ext) => `.${ext}`),
].join(",");
const MAX_MB = MAX_AUDIO_BYTES / 1024 / 1024;

function audioType(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type || (EXTENSION_TYPES[extension] ?? "");
  return TYPE_ALIASES[type] ?? type;
}

export function validateAudioFile(
  file: File,
): { ok: true; contentType: string } | { ok: false; error: string } {
  const contentType = audioType(file);
  if (!isAllowedAudioType(contentType)) {
    return {
      ok: false,
      error: "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
    };
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `This file is over ${MAX_MB} MB. Choose a shorter recording.`,
    };
  }
  if (file.size === 0) return { ok: false, error: "This file is empty." };
  return { ok: true, contentType };
}

export function UploadAudioButton({
  onSubmit,
  onReject,
  disabled = false,
  className,
}: UploadAudioButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so re-picking the same file still fires change.
    event.target.value = "";
    if (!file) return;
    const check = validateAudioFile(file);
    if (!check.ok) {
      setError(check.error);
      onReject?.(check.error);
      return;
    }
    setError(null);
    onSubmit({ blob: file, contentType: check.contentType, source: "upload" });
  };

  return (
    <div className={tw("flex flex-col gap-1.5")}>
      <Button
        variant="secondary"
        onClick={(event) => {
          // Can appear under the second click of a Discard double click.
          if (event.detail > 1) return;
          inputRef.current?.click();
        }}
        disabled={disabled}
        aria-describedby={error ? errorId : undefined}
        className={className}
      >
        <Upload aria-hidden="true" />
        Upload audio
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label="Audio file"
        hidden
        disabled={disabled}
        onChange={handleChange}
      />
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
