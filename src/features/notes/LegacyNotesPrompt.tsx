import { tw } from "@tw";
import { WandSparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toaster";
import { ApiError, errorMessage, regenerateNotes } from "@/lib/api";

type LegacyNotesPromptProps = {
  meetingId: string;
  onUpdated: () => void;
  onBusyChange?: (busy: boolean) => void;
  className?: string;
};

export function LegacyNotesPrompt({
  meetingId,
  onUpdated,
  onBusyChange,
  className,
}: LegacyNotesPromptProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    onBusyChange?.(true);
    try {
      await regenerateNotes(meetingId);
    } catch (err) {
      // 409: another tab started it already; the refetch shows the run.
      if (!(err instanceof ApiError && err.status === 409)) {
        toast({ title: errorMessage(err), tone: "danger" });
      }
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      onUpdated();
    }
  };

  return (
    <div
      className={tw(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-control bg-sunken px-4 py-3",
        className,
      )}
    >
      <p
        className={tw(
          "flex min-w-0 flex-1 basis-60 items-start gap-2.5 type-small text-graphite",
        )}
      >
        <WandSparkles
          aria-hidden="true"
          size={16}
          className={tw("mt-px shrink-0 text-ink")}
        />
        This meeting has a short summary. Generate detailed notes with
        timestamps.
      </p>
      <Button size="sm" busy={busy} onClick={generate}>
        {busy ? "Generating notes…" : "Generate detailed notes"}
      </Button>
    </div>
  );
}
