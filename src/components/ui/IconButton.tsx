import { tw } from "@tw";
import { LucideProvider } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { type ButtonVariant, buttonVariants } from "./Button";
import { Tooltip } from "./Tooltip";

const sizes = { sm: "size-8", md: "size-10" } as const;
const iconSizes = { sm: 16, md: 18 } as const;

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  label: string;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  tooltip?: boolean | ReactNode;
};

export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  tooltip = true,
  className,
  type,
  children,
  ...props
}: IconButtonProps) {
  // An explicit key wins radix's Slot merge, so the label isn't read twice.
  const describedBy =
    tooltip === true
      ? { "aria-describedby": props["aria-describedby"] }
      : undefined;
  const button = (
    <button
      type={type ?? "button"}
      aria-label={label}
      {...describedBy}
      className={tw(
        "inline-flex shrink-0 items-center justify-center rounded-control transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        {children}
      </LucideProvider>
    </button>
  );

  if (tooltip === false) return button;
  return (
    <Tooltip content={tooltip === true ? label : tooltip}>{button}</Tooltip>
  );
}
