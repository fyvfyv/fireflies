import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toaster";

const CONFIRM_MS = 2_000;

export function useCopyAction(
  write: () => Promise<void>,
  messages: { success: string; failure: string },
) {
  const { toast } = useToast();
  // Counts copies (null: nothing to confirm), so each copy restarts the timer.
  const [copies, setCopies] = useState<number | null>(null);

  useEffect(() => {
    if (copies === null) return;
    const timer = setTimeout(() => setCopies(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [copies]);

  const copy = async () => {
    try {
      await write();
    } catch {
      toast({ title: messages.failure, tone: "danger" });
      return;
    }
    setCopies((count) => (count ?? 0) + 1);
    toast({ title: messages.success });
  };

  return { copied: copies !== null, copy };
}
