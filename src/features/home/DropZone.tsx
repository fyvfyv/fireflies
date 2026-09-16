import { MAX_AUDIO_BYTES } from "@shared/constants";
import { tw } from "@tw";
import { Upload } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { validateAudioFile } from "@/features/meetings/UploadAudioButton";
import type { SubmitInput } from "@/features/meetings/useSubmitRecording";

type DropZoneProps = {
  onSubmit: (input: SubmitInput) => void;
  onReject: (message: string) => void;
  disabled?: boolean;
};

const hasFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

export function DropZone({
  onSubmit,
  onReject,
  disabled = false,
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onSubmit, onReject, disabled });
  useLayoutEffect(() => {
    latest.current = { onSubmit, onReject, disabled };
  });

  useEffect(() => {
    // dragenter/dragleave fire for every element crossed.
    const entered = new Set<EventTarget>();
    const reset = () => {
      entered.clear();
      setDragging(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.target) entered.add(event.target);
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Always cancel: an uncancelled drop makes the browser open the file.
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = latest.current.disabled
          ? "none"
          : "copy";
      }
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.target) entered.delete(event.target);
      // Elements removed mid-drag never fire their own dragleave.
      for (const target of entered) {
        if (target instanceof Node && !target.isConnected) {
          entered.delete(target);
        }
      }
      if (entered.size === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      reset();
      const { onSubmit, onReject, disabled } = latest.current;
      const file = event.dataTransfer?.files[0];
      if (disabled || !file) return;
      const check = validateAudioFile(file);
      if (check.ok) {
        onSubmit({
          blob: file,
          contentType: check.contentType,
          source: "upload",
        });
      } else {
        onReject(check.error);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", reset);
    };
  }, []);

  if (!dragging || disabled) return null;
  return (
    <div
      className={tw(
        "pointer-events-none fixed inset-0 z-40 bg-paper/85 p-3 backdrop-blur-sm sm:p-6",
      )}
    >
      <div
        className={tw(
          "grid size-full place-items-center rounded-sheet border-2 border-dashed border-rule bg-sheet/80 px-6",
        )}
      >
        <div
          className={tw(
            "flex animate-reveal flex-col items-center text-center",
          )}
        >
          <span
            aria-hidden="true"
            className={tw(
              "mb-5 grid size-14 place-items-center rounded-full bg-marker text-marker-ink",
            )}
          >
            <Upload size={24} />
          </span>
          <p className={tw("type-title text-balance")}>
            Drop an audio file to transcribe it
          </p>
          <p className={tw("mt-2 type-small text-graphite")}>
            WebM, M4A, MP3, WAV or OGG, up to {MAX_AUDIO_BYTES / 1024 / 1024}{" "}
            MB.
          </p>
        </div>
      </div>
    </div>
  );
}
