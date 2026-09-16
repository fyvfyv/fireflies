import { tw } from "@tw";
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
        "flex items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-body text-red-800",
      )}
    >
      <span>{message}</span>
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
