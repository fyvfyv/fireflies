import {
  ALLOWED_AUDIO_TYPES,
  isAllowedAudioType,
  MAX_AUDIO_BYTES,
} from "@shared/constants";
import { tw } from "@tw";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SubmitInput } from "./useSubmitRecording";

type UploadAudioButtonProps = {
  onSubmit: (input: SubmitInput) => void;
  disabled?: boolean;
};

// Browsers and OSes disagree on audio types: .webm files (including
// recordings downloaded from this app) come as video/webm, WAV and MP3 have
// legacy aliases, and some systems report no type at all.
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

function validate(file: File): string | null {
  if (!isAllowedAudioType(audioType(file))) {
    return "Choose an audio file (WebM, M4A, MP3, WAV or OGG).";
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return `This file is over ${MAX_MB} MB. Choose a shorter recording.`;
  }
  if (file.size === 0) return "This file is empty.";
  return null;
}

export function UploadAudioButton({
  onSubmit,
  disabled = false,
}: UploadAudioButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;
    const problem = validate(file);
    setError(problem);
    if (problem) return;
    onSubmit({
      blob: file,
      contentType: audioType(file),
      source: "upload",
    });
  };

  return (
    <div className={tw("space-y-1")}>
      <Button
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-describedby={error ? errorId : undefined}
      >
        Upload audio file
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
          className={tw("max-w-xs text-caption text-red-700")}
        >
          {error}
        </p>
      )}
    </div>
  );
}
