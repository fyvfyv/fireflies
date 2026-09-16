import { Slot } from "@radix-ui/react-slot";
import { tw } from "@tw";
import { LucideProvider } from "lucide-react";
import type { ComponentProps } from "react";
import { Spinner } from "./Spinner";

export const buttonVariants = {
  primary: "bg-ink text-sheet hover:bg-ink/85",
  secondary: "border border-rule bg-sheet text-ink hover:bg-sunken",
  ghost: "text-graphite hover:bg-sunken hover:text-ink",
  // /90 drops white text below 4.5:1 in light mode.
  danger: "bg-danger text-sheet hover:bg-danger/95",
} as const;

const sizes = {
  sm: "h-8 gap-1.5 px-3 text-small",
  md: "h-10 gap-2 px-4 text-small",
  lg: "h-12 gap-2 px-5 text-body",
} as const;

const iconSizes = { sm: 16, md: 18, lg: 18 } as const;

export type ButtonVariant = keyof typeof buttonVariants;

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
} & (
    | {
        asChild?: false;
        busy?: boolean;
      }
    | { asChild: true; busy?: never }
  );

export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  busy = false,
  className,
  type,
  onClick,
  children,
  ...props
}: ButtonProps) {
  const classes = tw(
    "inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress",
    buttonVariants[variant],
    sizes[size],
    className,
  );

  if (asChild) {
    return (
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        <Slot className={classes} onClick={onClick} {...props}>
          {children}
        </Slot>
      </LucideProvider>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
      // aria-disabled, not disabled, so focus stays on the button while busy.
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) event.preventDefault();
        else onClick?.(event);
      }}
      {...props}
    >
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        {busy && <Spinner size={iconSizes[size]} />}
        {children}
      </LucideProvider>
    </button>
  );
}
