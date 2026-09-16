import { tw } from "@tw";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

type ErrorAlertProps = {
  message: string;
  action?: { label: string; onClick: () => void };
};

export function ErrorAlert({ message, action }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={tw(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-danger/40 bg-sheet py-2 pr-2 pl-3 text-small text-ink",
      )}
    >
      <CircleAlert
        aria-hidden="true"
        size={16}
        className={tw("shrink-0 text-danger")}
      />
      <p className={tw("min-w-0 flex-1 py-1.5")}>{message}</p>
      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
