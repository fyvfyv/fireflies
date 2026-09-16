import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toaster";

const CONFIRM_MS = 2_000;

/**
 * Runs a clipboard write and confirms it twice: a toast, and `copied` for two
 * seconds so the button can swap its icon.
 */
export function useCopyAction(
  write: () => Promise<void>,
  messages: { success: string; failure: string },
) {
  const { toast } = useToast();
  // Counts copies (null: nothing to confirm), so each copy restarts the timer.
  const [copies, setCopies] = useState<number | null>(null);
  const latest = useRef({ write, messages });
  latest.current = { write, messages };

  useEffect(() => {
    if (copies === null) return;
    const timer = setTimeout(() => setCopies(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [copies]);

  const copy = useCallback(async () => {
    const { write: run, messages: copy } = latest.current;
    try {
      await run();
    } catch {
      toast({ title: copy.failure, tone: "danger" });
      return;
    }
    setCopies((count) => (count ?? 0) + 1);
    toast({ title: copy.success });
  }, [toast]);

  return { copied: copies !== null, copy };
}
