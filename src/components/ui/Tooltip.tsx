import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { tw } from "@tw";
import { createContext, type FocusEvent, type ReactNode, use } from "react";

const DELAY_MS = 300;

const ProviderMounted = createContext(false);

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <ProviderMounted value={true}>
      <TooltipPrimitive.Provider
        delayDuration={DELAY_MS}
        skipDelayDuration={DELAY_MS}
      >
        {children}
      </TooltipPrimitive.Provider>
    </ProviderMounted>
  );
}

// Radix opens on any focus, even a menu returning focus to its trigger, so only
// keyboard focus opens it. Tracked by hand: jsdom's :focus-visible goes stale.
let lastInputWasPointer = false;
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
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      lastInputWasPointer = false;
    }
  },
  true,
);

function skipPointerFocus(event: FocusEvent<HTMLElement>) {
  // Radix doesn't open on a prevented focus event.
  if (lastInputWasPointer) event.preventDefault();
}

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  open,
  onOpenChange,
}: TooltipProps) {
  const hasProvider = use(ProviderMounted);
  if (content === null || content === undefined || content === "") {
    return children;
  }

  const tooltip = (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
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
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );

  // Radix throws without a provider.
  return hasProvider ? (
    tooltip
  ) : (
    <TooltipPrimitive.Provider delayDuration={DELAY_MS}>
      {tooltip}
    </TooltipPrimitive.Provider>
  );
}
