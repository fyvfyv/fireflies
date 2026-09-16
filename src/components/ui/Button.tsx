import { Slot, Slottable } from "@radix-ui/react-slot";
import { tw } from "@tw";
import { LucideProvider } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";
import { Spinner } from "./Spinner";

export const buttonVariants = {
  primary: "bg-ink text-sheet hover:bg-ink/85",
  secondary: "border border-rule bg-sheet text-ink hover:bg-sunken",
  ghost: "text-graphite hover:bg-sunken hover:text-ink",
  // /90 drops white text below 4.5:1 in light mode.
  danger: "bg-danger text-sheet hover:bg-danger/95",
  marker: "bg-marker text-marker-ink hover:bg-marker/80",
} as const;

export const buttonSizes = {
  sm: "h-8 gap-1.5 px-3 text-small",
  md: "h-10 gap-2 px-4 text-small",
  lg: "h-12 gap-2 px-5 text-body",
} as const;

const iconSizes = { sm: 16, md: 18, lg: 18 } as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  /** Shows a spinner and ignores activation until the work finishes. */
  busy?: boolean;
};

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
    buttonSizes[size],
    className,
  );
  // aria-disabled instead of disabled keeps focus on the button while it
  // works, so keyboard users don't lose their place.
  const busyProps = busy
    ? { "aria-busy": true, "aria-disabled": true }
    : undefined;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      // Also stops a submit button from submitting its form again.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  const spinner = busy && <Spinner key="spinner" size={iconSizes[size]} />;

  if (asChild) {
    const slotProps = {
      className: classes,
      onClick: handleClick,
      ...busyProps,
      ...props,
      // Slot runs the child's own onClick before ours, so a busy button has
      // to stop the click before it reaches the child.
      ...(busy && { onClickCapture: stopActivation }),
    };
    // Context only, so it can wrap Slot without breaking its single child.
    // Slottable has to be a direct child of Slot for the spinner to land
    // inside the caller's element.
    return (
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        {busy ? (
          <Slot {...slotProps}>
            {spinner}
            <Slottable>{children}</Slottable>
          </Slot>
        ) : (
          <Slot {...slotProps}>{children}</Slot>
        )}
      </LucideProvider>
    );
  }
  return (
    <button
      // Not the HTML default "submit": a Button in a form never submits by accident.
      type={type ?? "button"}
      className={classes}
      onClick={handleClick}
      {...busyProps}
      {...props}
    >
      <LucideProvider size={iconSizes[size]} strokeWidth={1.75}>
        {spinner}
        {children}
      </LucideProvider>
    </button>
  );
}

function stopActivation(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}
