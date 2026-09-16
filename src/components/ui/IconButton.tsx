import { tw } from "@tw";
import { LucideProvider } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { type ButtonVariant, buttonVariants } from "./Button";
import { Spinner } from "./Spinner";
import { Tooltip } from "./Tooltip";

const sizes = { sm: "size-8", md: "size-10" } as const;
const iconSizes = { sm: 16, md: 18 } as const;

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  /** `false` hides the tooltip; a node replaces the label in it. */
  tooltip?: boolean | ReactNode;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Swaps the icon for a spinner and ignores activation. */
  busy?: boolean;
};

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  tooltip = true,
  tooltipSide,
  busy = false,
  className,
  type,
  onClick,
  children,
  ...props
}: IconButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  // When the tooltip only repeats the label, keep radix from also pointing
  // aria-describedby at it: an explicit key on the child wins the Slot merge,
  // and screen readers no longer read the name twice.
  const describedBy =
    tooltip === true
      ? { "aria-describedby": props["aria-describedby"] }
      : undefined;
  // Spread last: as a radix trigger (asChild) this receives the trigger's
  // ref, handlers and aria-expanded through `props`.
  const button = (
    <button
      type={type ?? "button"}
      aria-label={label}
      {...describedBy}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      className={tw(
        "inline-flex shrink-0 items-center justify-center rounded-control transition-colors",
        "disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        {busy ? <Spinner /> : children}
      </LucideProvider>
    </button>
  );

  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip === true ? label : tooltip} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
