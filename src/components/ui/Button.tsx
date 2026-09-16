import { Slot } from "@radix-ui/react-slot";
import { tw } from "@tw";
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-700",
  secondary:
    "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  danger: "bg-red-600 text-white hover:bg-red-500",
  ghost: "text-neutral-700 hover:bg-neutral-100",
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  asChild = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const classes = tw(
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-body font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    className,
  );
  if (asChild) return <Slot className={classes} {...props} />;
  // Not the HTML default "submit": a Button in a form never submits by accident.
  return <button type={type ?? "button"} className={classes} {...props} />;
}
