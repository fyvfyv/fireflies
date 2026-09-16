import { tw } from "@tw";
import { TrySampleButton } from "./TrySampleButton";
import { UploadAudioButton } from "./UploadAudioButton";
import type { SubmitInput } from "./useSubmitRecording";

type MicFreeOptionsProps = {
  onSubmit: (input: SubmitInput) => void;
  disabled?: boolean;
};

export function MicFreeOptions({ onSubmit, disabled }: MicFreeOptionsProps) {
  return (
    <div className={tw("flex flex-wrap items-start gap-2")}>
      <p className={tw("py-2 text-body text-neutral-600")}>No microphone?</p>
      <TrySampleButton onSubmit={onSubmit} disabled={disabled} />
      <UploadAudioButton onSubmit={onSubmit} disabled={disabled} />
    </div>
  );
}
