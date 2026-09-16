import { tw } from "@tw";
import { Trash2 } from "lucide-react";
import { type ComponentProps, useId } from "react";
import { Button } from "@/components/ui/Button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";

type ConfirmProps = {
  onConfirm: () => void;
  deleting?: boolean;
  error?: string | null;
};

export function DeleteMeetingButton({
  label,
  ...confirm
}: ConfirmProps & { label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">
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
