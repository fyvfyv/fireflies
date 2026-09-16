import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/Tooltip";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LucideProvider size={16} strokeWidth={1.75}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </LucideProvider>
  );
}
