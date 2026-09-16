import { tw } from "@tw";
import { LoaderCircle } from "lucide-react";

type SpinnerProps = {
  /** Announced to screen readers; without it the spinner is decorative. */
  label?: string;
  size?: number;
  className?: string;
};

export function Spinner({ label, size, className }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden="true"
      data-slot="spinner"
      size={size}
      className={tw("shrink-0 animate-spin", className)}
    />
  );
  if (!label) return icon;
  return (
    <span role="status" className={tw("inline-flex items-center")}>
      {icon}
      <span className={tw("sr-only")}>{label}</span>
    </span>
  );
}
