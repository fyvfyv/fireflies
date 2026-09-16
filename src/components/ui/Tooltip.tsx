import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { tw } from "@tw";
import { createContext, type FocusEvent, type ReactNode, use } from "react";

const DELAY_MS = 300;

const ProviderMounted = createContext(false);

/** Shares hover delays across tooltips; mounted once by the app shell. */
export function TooltipProvider({
  children,
  delayDuration = DELAY_MS,
}: {
  children: ReactNode;
  delayDuration?: number;
}) {
  return (
    <ProviderMounted value={true}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={DELAY_MS}
      >
        {children}
      </TooltipPrimitive.Provider>
    </ProviderMounted>
  );
}

/*
 * Radix opens a tooltip on any focus. Menus and popovers hand focus back to
 * their trigger when they close, which would pop the tooltip up right after a
 * mouse user picks an item, so focus only opens it after keyboard use. This
 * tracks the last input itself rather than asking `:focus-visible`, whose
 * jsdom emulation goes stale between tests.
 */
let lastInputWasPointer = false;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      lastInputWasPointer = true;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      // Shortcuts such as Cmd+C are not keyboard navigation.
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        lastInputWasPointer = false;
      }
    },
    true,
  );
}

function skipPointerFocus(event: FocusEvent<HTMLElement>) {
  // A prevented focus event makes radix skip opening.
  if (lastInputWasPointer) event.preventDefault();
}

type TooltipProps = {
  /** Nothing is rendered around the trigger when empty. */
  content: ReactNode;
  /** A single focusable element (the trigger). */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  className?: string;
};

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  open,
  onOpenChange,
  delayDuration,
  className,
}: TooltipProps) {
  const hasProvider = use(ProviderMounted);
  if (content === null || content === undefined || content === "") {
    return children;
  }

  const tooltip = (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
    >
      <TooltipPrimitive.Trigger asChild onFocus={skipPointerFocus}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={tw(
            "z-50 max-w-64 rounded-md bg-ink px-2 py-1 text-caption text-pretty text-sheet shadow-float",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );

  // Radix throws without a provider; components rendered on their own (in
  // tests or outside the shell) get a local one instead.
  return hasProvider ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider delayDuration={DELAY_MS}>
      {tooltip}
    </TooltipPrimitive.Provider>
  );
}
