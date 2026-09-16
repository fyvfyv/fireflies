import { tw } from "@tw";
import { TrySampleButton } from "./TrySampleButton";
import { UploadAudioButton } from "./UploadAudioButton";
import type { SubmitInput } from "./useSubmitRecording";

type MicFreeOptionsProps = {
  onSubmit: (input: SubmitInput) => void;
  onReject?: (message: string) => void;
  disabled?: boolean;
  label?: string | null;
  className?: string;
};

export function MicFreeOptions({
  onSubmit,
  onReject,
  disabled,
  label = "No microphone?",
  className,
}: MicFreeOptionsProps) {
  return (
    <div
      className={tw(
        "flex flex-col gap-x-4 gap-y-3 sm:flex-row sm:flex-wrap sm:items-start",
        className,
      )}
    >
      {label && (
        <p
          className={tw(
            "type-small text-graphite sm:flex sm:h-10 sm:items-center",
          )}
        >
          {label}
        </p>
      )}
      <div
        className={tw(
          "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start",
        )}
      >
        <TrySampleButton
          onSubmit={onSubmit}
          disabled={disabled}
          className={tw("w-full sm:w-auto")}
        />
        <UploadAudioButton
          onSubmit={onSubmit}
          onReject={onReject}
          disabled={disabled}
          className={tw("w-full sm:w-auto")}
        />
      </div>
    </div>
  );
}
