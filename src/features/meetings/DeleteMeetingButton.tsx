import { tw } from "@tw";
import { Trash2 } from "lucide-react";
import { type ComponentProps, useId } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";

type ConfirmProps = {
  onConfirm: () => void;
  deleting?: boolean;
  /** Why the last attempt failed; the panel stays open to show it. */
  error?: string | null;
};

type DeleteMeetingButtonProps = ConfirmProps & {
  label?: string;
  variant?: ButtonVariant;
};

/** A button that asks in a small popover before deleting the meeting. */
export function DeleteMeetingButton({
  label = "Delete meeting",
  variant = "secondary",
  ...confirm
}: DeleteMeetingButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={variant}>
          <Trash2 aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <DeleteConfirmContent align="start" {...confirm} />
    </Popover>
  );
}

type ContentProps = ConfirmProps &
  Omit<ComponentProps<typeof PopoverContent>, "children" | "onError">;

/**
 * The confirmation panel, for any Popover. The meeting page opens it from its
 * overflow menu, so it isn't tied to a trigger button.
 */
export function DeleteConfirmContent({
  onConfirm,
  deleting = false,
  error = null,
  className,
  ...props
}: ContentProps) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <PopoverContent
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={tw("space-y-3", className)}
      // Deleting can't be interrupted; keep the panel until it finishes.
      onEscapeKeyDown={(event) => deleting && event.preventDefault()}
      onPointerDownOutside={(event) => deleting && event.preventDefault()}
      {...props}
    >
      <div className={tw("space-y-0.5")}>
        <p id={titleId} className={tw("type-body font-semibold text-ink")}>
          Delete this meeting?
        </p>
        <p id={descriptionId} className={tw("type-small text-graphite")}>
          This can't be undone.
        </p>
      </div>
      {error && (
        <p role="alert" className={tw("type-small text-danger")}>
          {error}
        </p>
      )}
      <div className={tw("flex justify-end gap-2")}>
        <PopoverClose asChild>
          <Button variant="secondary" size="sm" disabled={deleting}>
            Cancel
          </Button>
        </PopoverClose>
        <Button variant="danger" size="sm" busy={deleting} onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </PopoverContent>
  );
}
