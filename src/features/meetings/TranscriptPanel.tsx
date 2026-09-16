import type { Segment } from "@shared/schemas";
import { tw } from "@tw";
import { useId } from "react";
import { formatTimestamp } from "@/lib/time";

type TranscriptPanelProps = {
  text: string | null;
  segments: Segment[] | null;
};

export function TranscriptPanel({ text, segments }: TranscriptPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={tw("space-y-3 rounded-lg border p-4")}
    >
      <h2 id={headingId} className={tw("font-semibold")}>
        Transcript
      </h2>
      <TranscriptBody text={text} segments={segments} />
    </section>
  );
}

function TranscriptBody({ text, segments }: TranscriptPanelProps) {
  if (text === null) {
    return (
      <p className={tw("text-body text-neutral-500")}>
        The transcript will appear here once transcription finishes.
      </p>
    );
  }
  if (!text.trim()) {
    return (
      <p className={tw("text-body text-neutral-500")}>
        No speech was detected.
      </p>
    );
  }
  // Providers without timestamps only return the full text.
  if (!segments?.length) {
    return <p className={tw("whitespace-pre-wrap text-body")}>{text}</p>;
  }
  return (
    <ol className={tw("space-y-2 text-body")}>
      {segments.map((segment, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list; Whisper often repeats a segment verbatim
        <li key={index} className={tw("flex gap-3")}>
          <span className={tw("shrink-0 text-neutral-500 tabular-nums")}>
            {formatTimestamp(segment.startSecond)}
          </span>
          <span>{segment.text.trim()}</span>
        </li>
      ))}
    </ol>
  );
}
