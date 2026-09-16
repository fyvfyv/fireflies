import { MIN_TRANSCRIPT_WORDS } from "@shared/constants";
import type { Meeting, NoteSection, Summary } from "@shared/schemas";
import { tw } from "@tw";
import { Check, Copy, Info } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { usePlayer, usePlayerActions } from "@/features/player/PlayerProvider";
import { releasePointerFocus } from "@/features/player/releasePointerFocus";
import { HIT_AREA, TimestampMark } from "@/features/player/TimestampMark";
import { spanAt, type TapeSpan, tapeSpans } from "@/features/player/tape";
import { copyRich } from "@/lib/clipboard";
import { formatShortTime } from "@/lib/time";
import { ActionItems } from "./ActionItems";
import { KeywordChips } from "./KeywordChips";
import { LegacyNotesPrompt } from "./LegacyNotesPrompt";
import { notesToClipboard } from "./notesToClipboard";
import { RichText } from "./RichText";
import { topicBackground } from "./topics";
import { useCopyAction } from "./useCopyAction";

type NotesDocumentProps = {
  meeting: Meeting;
  onUpdated: () => void;
  onRegeneratingChange?: (busy: boolean) => void;
};

// Module-level, so switching tabs or re-rendering on a poll never replays the entrance.
const revealed = new Set<string>();

export function NotesDocument(props: NotesDocumentProps) {
  const { summary } = props.meeting;
  if (!summary) return null;
  const revealKey = `${props.meeting.id}:${summary.notes.length > 0 ? "notes" : "summary"}`;
  return (
    <NotesSheet
      key={revealKey}
      {...props}
      summary={summary}
      revealKey={revealKey}
    />
  );
}

const NBSP = String.fromCharCode(0xa0);

const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });

// Mirrors the server's check, so the prompt only shows when it can succeed.
function hasEnoughWords(text: string | null) {
  let count = 0;
  for (const segment of wordSegmenter.segment(text ?? "")) {
    if (segment.isWordLike && ++count >= MIN_TRANSCRIPT_WORDS) return true;
  }
  return false;
}

function NotesSheet({
  meeting,
  summary,
  revealKey,
  onUpdated,
  onRegeneratingChange,
}: NotesDocumentProps & { summary: Summary; revealKey: string }) {
  const [reveal] = useState(() => !revealed.has(revealKey));
  useEffect(() => {
    revealed.add(revealKey);
  }, [revealKey]);

  const { copied, copy } = useCopyAction(
    () => {
      const { html, markdown } = notesToClipboard(meeting);
      return copyRich({ html, text: markdown });
    },
    { success: "Notes copied", failure: "Couldn't copy the notes. Try again." },
  );

  let step = 0;
  const enter = (): { className?: string; style?: CSSProperties } =>
    reveal
      ? {
          className: "animate-reveal",
          style: { "--i": step++ } as CSSProperties,
        }
      : {};

  // From the meeting rather than the player, so the sheet doesn't re-render on time updates.
  const spans = useMemo(
    () => tapeSpans(summary.notes, meeting.durationSeconds ?? 0),
    [summary.notes, meeting.durationSeconds],
  );

  const legacy = summary.notes.length === 0;
  const showPrompt = legacy && hasEnoughWords(meeting.transcriptText);

  return (
    <div className={tw("flow-root")}>
      <div
        className={tw("mb-4 flex justify-end sm:float-right sm:mb-3 sm:ml-4")}
      >
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check className={tw("text-ok")} /> : <Copy />}
          Copy notes
        </Button>
      </div>

      {meeting.transcriptTruncated && (
        <p
          role="note"
          className={tw("mb-4 flex items-start gap-2 type-small text-graphite")}
        >
          <Info aria-hidden="true" className={tw("mt-px shrink-0")} />
          This meeting was too long to summarize in full, so the notes cover
          only the first part of the transcript.
        </p>
      )}

      <div {...enter()}>
        {summary.overview && (
          <p className={tw("max-w-[68ch] type-lead text-pretty text-ink")}>
            {summary.overview}
          </p>
        )}
        <KeywordChips keywords={summary.keywords} className={tw("mt-4")} />
      </div>

      {showPrompt && (
        <div {...enter()}>
          <LegacyNotesPrompt
            meetingId={meeting.id}
            onUpdated={onUpdated}
            onBusyChange={onRegeneratingChange}
            className={tw("mt-6")}
          />
        </div>
      )}

      {!legacy && (
        <div className={tw("mt-10 space-y-9")}>
          {summary.notes.map((section, index) => (
            <TopicSection
              // biome-ignore lint/suspicious/noArrayIndexKey: sections are positional and their index picks the color
              key={index}
              section={section}
              index={index}
              spans={spans}
              {...enter()}
            />
          ))}
        </div>
      )}

      {summary.actionItems.length > 0 && (
        <DocumentBlock title="Action items" {...enter()}>
          <ActionItems meetingId={meeting.id} items={summary.actionItems} />
        </DocumentBlock>
      )}
      {summary.decisions.length > 0 && (
        <ListBlock title="Decisions" items={summary.decisions} {...enter()} />
      )}
      {legacy && summary.keyTakeaways.length > 0 && (
        <ListBlock
          title="Key takeaways"
          items={summary.keyTakeaways}
          {...enter()}
        />
      )}
    </div>
  );
}

function TopicSection({
  section,
  index,
  spans,
  className,
  style,
}: {
  section: NoteSection;
  index: number;
  spans: readonly TapeSpan[];
  className?: string;
  style?: CSSProperties;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      style={style}
      // From md the swatch and its gap (4px + 14px) hang in the gutter, aligning text with the overview.
      className={tw("flex items-start gap-3.5 md:-ml-[1.125rem]", className)}
    >
      <SectionSwatch index={index} spans={spans} />
      <div className={tw("min-w-0 flex-1")}>
        <div className={tw("max-w-[68ch] text-balance")}>
          <h2 id={headingId} className={tw("inline type-heading")}>
            {section.heading}
          </h2>
          {section.startSecond !== null && (
            <>
              {NBSP}
              <SectionTime
                heading={section.heading}
                start={section.startSecond}
                end={spans.find((span) => span.index === index)?.end ?? null}
              />
            </>
          )}
        </div>
        {section.gist && (
          <p className={tw("mt-1 max-w-[68ch] type-body text-graphite")}>
            {section.gist}
          </p>
        )}
        {section.points.length > 0 && (
          <ul className={tw("mt-3 max-w-[68ch] space-y-3")}>
            {section.points.map((point, pointIndex) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: points are positional and may repeat
                key={pointIndex}
                className={tw(
                  "relative pl-4",
                  "before:absolute before:top-[9px] before:left-0 before:size-1.5 before:rounded-full before:bg-ink",
                )}
              >
                <p className={tw("type-body font-medium text-pretty text-ink")}>
                  <RichText text={point.text} />
                  {point.startSecond !== null && (
                    <>
                      {NBSP}
                      <TimestampMark
                        seconds={point.startSecond}
                        className={tw("ml-0.5")}
                      />
                    </>
                  )}
                </p>
                {point.details.length > 0 && (
                  <ul className={tw("mt-1 space-y-1")}>
                    {point.details.map((detail, detailIndex) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: details are positional and may repeat
                        key={detailIndex}
                        className={tw(
                          "relative pl-4 type-body text-pretty text-graphite",
                          "before:absolute before:top-[9px] before:left-0.5 before:size-1.5 before:rounded-full before:border before:border-faint",
                        )}
                      >
                        <RichText text={detail} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// A leaf, so only swatches re-render on time updates; the stretched wrapper gives `h-full` a definite height.
function SectionSwatch({
  index,
  spans,
}: {
  index: number;
  spans: readonly TapeSpan[];
}) {
  const { currentTime, playing } = usePlayer();
  const active =
    (playing || currentTime > 0) && spanAt(spans, currentTime)?.index === index;
  return (
    <span
      aria-hidden="true"
      className={tw("flex w-1 shrink-0 self-stretch pt-[5px]")}
    >
      <span
        data-slot="topic-swatch"
        data-active={active ? "" : undefined}
        className={tw(
          "w-full rounded-full transition-[height] duration-300 ease-out-soft",
          active ? "h-full" : "h-4",
          topicBackground(index),
        )}
      />
    </span>
  );
}

function SectionTime({
  heading,
  start,
  end,
}: {
  heading: string;
  start: number;
  end: number | null;
}) {
  const { seek } = usePlayerActions();
  const from = formatShortTime(start);
  const to = end !== null && end > start ? formatShortTime(end) : null;
  return (
    <button
      type="button"
      aria-label={`Play ${heading}, ${from}${to ? ` to ${to}` : ""}`}
      onClick={(event) => {
        seek(start, { play: true });
        releasePointerFocus(event);
      }}
      className={tw(
        "relative ml-0.5 rounded-md px-1 align-baseline type-small whitespace-nowrap text-graphite transition-colors hover:bg-sunken hover:text-ink",
        HIT_AREA,
      )}
    >
      {to ? `${from}–${to}` : from}
    </button>
  );
}

function DocumentBlock({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      style={style}
      className={tw("mt-10 border-t border-rule pt-8", className)}
    >
      <h2 id={headingId} className={tw("mb-3 type-heading")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ListBlock({
  title,
  items,
  className,
  style,
}: {
  title: string;
  items: readonly string[];
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <DocumentBlock title={title} className={className} style={style}>
      <ul aria-label={title} className={tw("max-w-[68ch] space-y-2")}>
        {items.map((item, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: static list whose items may repeat verbatim
            key={index}
            className={tw(
              "relative pl-4 type-body text-pretty text-ink",
              "before:absolute before:top-[9px] before:left-0 before:size-1.5 before:rounded-full before:bg-faint",
            )}
          >
            <RichText text={item} />
          </li>
        ))}
      </ul>
    </DocumentBlock>
  );
}
