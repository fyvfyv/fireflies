import { tw } from "@tw";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type DeleteMeetingButtonProps = {
  onConfirm: () => void;
  label?: string;
  deleting?: boolean;
};

export function DeleteMeetingButton({
  onConfirm,
  label = "Delete",
  deleting = false,
}: DeleteMeetingButtonProps) {
  const questionId = useId();
  const [confirming, setConfirming] = useState(false);
  // The clicked button unmounts on toggle; without this, focus falls back to
  // the page body.
  const moveFocus = useRef(false);
  const focusWhenToggled = (element: HTMLButtonElement | null) => {
    if (!element || !moveFocus.current) return;
    moveFocus.current = false;
    element.focus();
  };
  const toggle = (next: boolean) => {
    moveFocus.current = true;
    setConfirming(next);
  };

  if (!confirming) {
    return (
      <Button
        ref={focusWhenToggled}
        variant="secondary"
        onClick={() => toggle(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset's legend can't sit inline with the buttons
    <div
      role="group"
      aria-labelledby={questionId}
      className={tw("flex flex-wrap items-center gap-2")}
    >
      <span id={questionId} className={tw("text-body text-neutral-700")}>
        Delete the meeting and its recording?
      </span>
      <Button variant="danger" onClick={onConfirm} disabled={deleting}>
        {deleting ? "Deleting…" : "Confirm delete"}
      </Button>
      <Button
        ref={focusWhenToggled}
        variant="secondary"
        onClick={() => toggle(false)}
        disabled={deleting}
      >
        Cancel
      </Button>
    </div>
  );
}
