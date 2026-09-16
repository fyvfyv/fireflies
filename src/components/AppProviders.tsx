import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/Tooltip";

/**
 * App-wide providers and the toast region. Shared by the layout and the test
 * router, so page tests see toasts and tooltips exactly like the app does.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    // Default icon size and stroke for UI icons; buttons and the player
    // override the size.
    <LucideProvider size={16} strokeWidth={1.75}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </LucideProvider>
  );
}
