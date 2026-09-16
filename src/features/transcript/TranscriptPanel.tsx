import type { Segment } from "@shared/schemas";
import { tw } from "@tw";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  type LucideIcon,
  MicOff,
} from "lucide-react";
import {
  Fragment,
  type KeyboardEvent,
  memo,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconButton } from "@/components/ui/IconButton";
import { SearchField } from "@/components/ui/SearchField";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCopyAction } from "@/features/notes/useCopyAction";
import { usePlayer } from "@/features/player/PlayerProvider";
import { releasePointerFocus } from "@/features/player/releasePointerFocus";
import { copyText } from "@/lib/clipboard";
import { formatShortTime } from "@/lib/time";
import {
  activeSegment,
  findMatches,
  type MatchRef,
  type Paragraph,
  paragraphAt,
  transcriptParagraphs,
  transcriptToText,
} from "./paragraphs";

const noop = () => {};

// How long a reader's own scrolling keeps playback from moving the view.
const FOLLOW_GRACE_MS = 4_000;
// A smooth scroll takes a moment; the jump pill ignores that window.
const AUTO_SCROLL_MS = 1_000;
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

type TranscriptPanelProps = {
  text: string | null;
  segments: Segment[] | null;
  /**
   * `rail`: a column with its own scroll area (wide screens).
   * `page`: flows with the page (the transcript tab).
   */
  layout?: "rail" | "page";
  /** Whether a missing transcript is on its way (false for a failed run). */
  transcribing?: boolean;
  className?: string;
};

export function TranscriptPanel({
  text,
  segments,
  layout = "page",
  transcribing = true,
  className,
}: TranscriptPanelProps) {
  const headingId = useId();
  const hasSpeech = Boolean(text?.trim());
  // Providers without timestamps only return the full text.
  const paragraphs = useMemo(
    () => transcriptParagraphs(text ?? "", segments),
    [text, segments],
  );
  const { copied, copy } = useCopyAction(
    () => copyText(transcriptToText(paragraphs)),
    {
      success: "Transcript copied",
      failure: "Couldn't copy the transcript. Try again.",
    },
  );

  const copyButton = (
    <IconButton
      label="Copy transcript"
      size="sm"
      disabled={!hasSpeech}
      onClick={copy}
    >
      {copied ? <Check className={tw("text-ok")} /> : <Copy />}
    </IconButton>
  );
  const page = layout === "page";

  return (
    <section
      aria-labelledby={headingId}
      className={tw("relative flex min-h-0 flex-col", className)}
    >
      {page ? (
        // The tab already says "Transcript"; the heading only names the
        // region, and the copy button joins the search row.
        <h2 id={headingId} className={tw("sr-only")}>
          Transcript
        </h2>
      ) : (
        <div
          className={tw(
            "flex items-center justify-between gap-3 px-5 pt-4 pb-3 md:px-6",
          )}
        >
          <h2 id={headingId} className={tw("type-heading")}>
            Transcript
          </h2>
          {copyButton}
        </div>
      )}
      {text === null ? (
        transcribing ? (
          <TranscribingState className={tw(page && "pt-4")} />
        ) : (
          <EmptyState icon={FileText}>There's no transcript yet.</EmptyState>
        )
      ) : hasSpeech ? (
        <TranscriptBody
          paragraphs={paragraphs}
          layout={layout}
          actions={page ? copyButton : undefined}
        />
      ) : (
        <EmptyState icon={MicOff}>No speech was detected.</EmptyState>
      )}
    </section>
  );
}

function EmptyState({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <p
      className={tw(
        "flex flex-col items-center gap-2 px-5 pt-8 pb-12 text-center type-body text-graphite",
      )}
    >
      <Icon aria-hidden="true" size={20} className={tw("text-faint")} />
      {children}
    </p>
  );
}

// No status or spinner: the processing steps next to it already report the
// progress, so this only says what will appear here.
function TranscribingState({ className }: { className?: string }) {
  return (
    <div className={tw("space-y-4 px-5 pb-6 md:px-6", className)}>
      <p className={tw("type-small text-graphite")}>
        The transcript appears here once the recording is transcribed.
      </p>
      <div className={tw("space-y-2.5")}>
        {["w-11/12", "w-4/5", "w-full", "w-2/3", "w-5/6", "w-3/5"].map(
          (width) => (
            <Skeleton key={width} className={tw("h-3.5", width)} />
          ),
        )}
      </div>
    </div>
  );
}

type IndexedMatch = MatchRef & { index: number };

function TranscriptBody({
  paragraphs,
  layout,
  actions,
}: {
  paragraphs: Paragraph[];
  layout: "rail" | "page";
  /** Extra controls at the end of the search row. */
  actions?: ReactNode;
}) {
  const { currentTime, playing, jump, seek } = usePlayer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);
  const lastAutoScroll = useRef(0);

  // Search
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => findMatches(paragraphs, deferredQuery),
    [paragraphs, deferredQuery],
  );
  const current =
    matches.length > 0
      ? ((step % matches.length) + matches.length) % matches.length
      : -1;
  const matchesByParagraph = useMemo(() => {
    const map = new Map<number, IndexedMatch[]>();
    matches.forEach((match, index) => {
      const list = map.get(match.paragraph) ?? [];
      list.push({ ...match, index });
      map.set(match.paragraph, list);
    });
    return map;
  }, [matches]);
  const searching = deferredQuery.trim() !== "" && matches.length > 0;
  const searchingRef = useRef(searching);
  searchingRef.current = searching;
  // Times take 5 characters until an hour in, 7 after; one wide paragraph
  // widens them all, so the text keeps one left edge.
  const longTimes = paragraphs.some((p) => (p.start ?? 0) >= 3600);

  // Playback
  const started = playing || currentTime > 0 || jump !== null;
  const activeId = started ? activeSegment(paragraphs, currentTime) : null;
  const activeParagraph =
    activeId === null
      ? -1
      : paragraphs.findIndex((p) => p.segments.some((s) => s.id === activeId));

  const container = () => (layout === "rail" ? scrollRef.current : null);
  const paragraphElement = useCallback(
    (index: number) =>
      scrollRef.current?.querySelector<HTMLElement>(
        `[data-paragraph="${index}"]`,
      ) ?? null,
    [],
  );
  const bringIntoView = (element: HTMLElement) => {
    lastAutoScroll.current = Date.now();
    centerIn(element, container());
  };

  // Reading along: keep the spoken paragraph visible, unless the reader has
  // scrolled in the last few seconds. A paragraph can be spoken for much
  // longer than that pause, so the reader's scrolling (below) also calls
  // `followLater` to look again once the pause ends.
  const followLater = useRef(noop);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the spoken paragraph changes, not on every time update
  useEffect(() => {
    if (!playing || activeParagraph < 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const follow = () => {
      clearTimeout(timer);
      // Reading search results; following resumes when the query is cleared.
      if (searchingRef.current) return;
      const sinceScroll = Date.now() - lastUserScroll.current;
      if (sinceScroll < FOLLOW_GRACE_MS) {
        timer = setTimeout(follow, FOLLOW_GRACE_MS - sinceScroll);
        return;
      }
      const element = paragraphElement(activeParagraph);
      if (element && !isFullyVisible(element, container())) {
        bringIntoView(element);
      }
    };
    follow();
    followLater.current = follow;
    return () => {
      clearTimeout(timer);
      followLater.current = noop;
    };
  }, [playing, activeParagraph]);

  // A cleared search hands the view back to playback right away.
  const wasSearching = useRef(searching);
  useEffect(() => {
    if (wasSearching.current && !searching) followLater.current();
    wasSearching.current = searching;
  }, [searching]);

  // Opened after playback moved while this view was closed (e.g. a timestamp
  // picked in the notes tab on a narrow screen): show that moment. While
  // playing, following does the same.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
  useEffect(() => {
    if (playing || activeParagraph < 0) return;
    const element = paragraphElement(activeParagraph);
    if (element && !isFullyVisible(element, container())) {
      bringIntoView(element);
    }
  }, []);

  // A moment picked anywhere (notes, tape, keys) moves the transcript there,
  // even while paused or without playable audio.
  const handledJump = useRef(jump?.id ?? 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to new jumps only
  useEffect(() => {
    if (!jump || jump.id === handledJump.current) return;
    handledJump.current = jump.id;
    const index = paragraphAt(paragraphs, jump.seconds);
    const element = index < 0 ? null : paragraphElement(index);
    lastUserScroll.current = 0;
    if (element && !isFullyVisible(element, container())) {
      bringIntoView(element);
    }
  }, [jump]);

  // The reader's own scrolling. Scroll events can't tell it apart from ours,
  // so the inputs that cause it are watched instead.
  useEffect(() => {
    const element = scrollRef.current;
    const target: HTMLElement | Window =
      layout === "rail" && element ? element : window;
    const mark = () => {
      lastUserScroll.current = Date.now();
      followLater.current();
    };
    const onKeyDown = (event: Event) => {
      if (SCROLL_KEYS.has((event as globalThis.KeyboardEvent).key)) mark();
    };
    // Grabbing the rail's scrollbar lands on the scroll container itself.
    const onPointerDown = (event: Event) => {
      if (event.target === element) mark();
    };
    target.addEventListener("wheel", mark, { passive: true });
    target.addEventListener("touchmove", mark, { passive: true });
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("pointerdown", onPointerDown);
    return () => {
      target.removeEventListener("wheel", mark);
      target.removeEventListener("touchmove", mark);
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("pointerdown", onPointerDown);
    };
  }, [layout]);

  // Where the spoken paragraph is relative to the view, for the jump pill.
  const [away, setAway] = useState<"up" | "down" | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: container() only reads the layout and a ref
  useEffect(() => {
    if (!playing || activeParagraph < 0) {
      setAway(null);
      return;
    }
    const scroller = container();
    let frame = 0;
    const check = () => {
      frame = 0;
      const element = paragraphElement(activeParagraph);
      const moving = Date.now() - lastAutoScroll.current < AUTO_SCROLL_MS;
      setAway(element && !moving ? outOfView(element, scroller) : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [playing, activeParagraph, layout, paragraphElement]);

  const jumpToCurrent = () => {
    const element = paragraphElement(activeParagraph);
    lastUserScroll.current = 0;
    setAway(null);
    if (element) bringIntoView(element);
  };

  // The current search match. Keyed by what the match is, so a refetch that
  // returns the same transcript in new objects doesn't pull the view back.
  const currentMatch = matches[current];
  const currentKey = currentMatch
    ? `${current}:${currentMatch.paragraph}:${currentMatch.segment}:${currentMatch.start}:${deferredQuery}`
    : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the current match changes
  useEffect(() => {
    if (current < 0) return;
    const mark = scrollRef.current?.querySelector<HTMLElement>(
      `mark[data-match="${current}"]`,
    );
    if (!mark) return;
    // Searching is reading: keep playback from pulling the view away.
    lastUserScroll.current = Date.now();
    const scroller = container();
    if (scroller) {
      if (!isFullyVisible(mark, scroller)) centerIn(mark, scroller);
    } else {
      mark.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    }
  }, [currentKey]);

  const stepBy = (delta: number) => {
    if (matches.length > 0) setStep(current + delta);
  };

  const onSeek = useCallback(
    (seconds: number) => seek(seconds, { play: true }),
    [seek],
  );

  return (
    <>
      <TranscriptSearch
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setStep(0);
        }}
        total={matches.length}
        current={current}
        onStep={stepBy}
        layout={layout}
        actions={actions}
      />
      <div
        ref={scrollRef}
        data-slot="transcript-scroll"
        className={tw(
          "px-5 pb-6 md:px-6",
          layout === "rail" &&
            // Scrolled text fades out under the search field instead of
            // being sliced at the edge.
            "min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 [mask-image:linear-gradient(to_bottom,transparent,black_12px)]",
        )}
      >
        <div className={tw("space-y-3")}>
          {paragraphs.map((paragraph, index) => (
            <ParagraphView
              // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are derived positionally from a static transcript
              key={index}
              index={index}
              paragraph={paragraph}
              longTimes={longTimes}
              activeId={index === activeParagraph ? activeId : null}
              matches={matchesByParagraph.get(index)}
              current={
                matches[current]?.paragraph === index ? current : undefined
              }
              onSeek={onSeek}
            />
          ))}
        </div>
        {playing && away && (
          <JumpPill direction={away} layout={layout} onClick={jumpToCurrent} />
        )}
      </div>
    </>
  );
}

function TranscriptSearch({
  query,
  onQueryChange,
  total,
  current,
  onStep,
  layout,
  actions,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  total: number;
  current: number;
  onStep: (delta: number) => void;
  layout: "rail" | "page";
  actions?: ReactNode;
}) {
  const searching = query.trim() !== "";
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onStep(event.shiftKey ? -1 : 1);
  };

  return (
    <div
      // Read by the visibility checks: in the tab, text under this row is
      // hidden.
      data-transcript-search=""
      className={tw(
        "flex items-center gap-2 px-5 pb-3 md:px-6",
        // In the tab the search stays at hand while reading: it sticks under
        // the sticky tab row (44px plus its hairline).
        layout === "page" &&
          "sticky top-[calc(2.75rem+1px)] z-10 bg-sheet pt-2",
      )}
    >
      <SearchField
        label="Search transcript"
        placeholder="Search transcript"
        value={query}
        onValueChange={onQueryChange}
        onKeyDown={onKeyDown}
        className={tw("flex-1")}
        trailing={
          <>
            <span
              role="status"
              className={tw(
                "shrink-0 px-1 type-caption whitespace-nowrap text-graphite empty:hidden",
              )}
            >
              {searching
                ? total > 0
                  ? `${current + 1} of ${total}`
                  : "No matches"
                : ""}
            </span>
            {searching && (
              <>
                <IconButton
                  label="Previous match"
                  size="sm"
                  tooltip={false}
                  disabled={total === 0}
                  onClick={() => onStep(-1)}
                >
                  <ChevronUp />
                </IconButton>
                <IconButton
                  label="Next match"
                  size="sm"
                  tooltip={false}
                  disabled={total === 0}
                  onClick={() => onStep(1)}
                >
                  <ChevronDown />
                </IconButton>
                <span
                  aria-hidden="true"
                  className={tw("mx-0.5 h-4 w-px shrink-0 bg-rule")}
                />
              </>
            )}
          </>
        }
      />
      {actions}
    </div>
  );
}

type ParagraphViewProps = {
  paragraph: Paragraph;
  index: number;
  /** Some paragraph starts past an hour, so times need a wider column. */
  longTimes: boolean;
  /** The spoken segment, when it is in this paragraph. */
  activeId: number | null;
  matches: IndexedMatch[] | undefined;
  /** The current match, when it is in this paragraph. */
  current: number | undefined;
  onSeek: (seconds: number) => void;
};

// Memoized: playback re-renders the body several times a second, but only
// the paragraph holding the spoken segment actually changes.
const ParagraphView = memo(function ParagraphView({
  paragraph,
  index,
  longTimes,
  activeId,
  matches,
  current,
  onSeek,
}: ParagraphViewProps) {
  const { start } = paragraph;
  return (
    <div
      data-paragraph={index}
      className={tw(
        "grid gap-x-3 rounded-md py-1.5",
        start === null
          ? "grid-cols-1"
          : longTimes
            ? "grid-cols-[3.5rem_minmax(0,1fr)]"
            : "grid-cols-[2.75rem_minmax(0,1fr)]",
      )}
    >
      {start !== null && (
        <button
          type="button"
          aria-label={`Play from ${formatShortTime(start)}`}
          onClick={(event) => {
            onSeek(start);
            releasePointerFocus(event);
          }}
          className={tw(
            "-ml-1 mt-0.5 h-5 justify-self-start rounded-md px-1 type-small text-graphite transition-colors",
            "hover:bg-sunken hover:text-ink",
          )}
        >
          {formatShortTime(start)}
        </button>
      )}
      <p className={tw("type-body text-pretty text-ink")}>
        {paragraph.segments.map((segment, position) => (
          <Fragment key={segment.id}>
            {position > 0 && " "}
            <span
              data-active={segment.id === activeId ? "" : undefined}
              className={tw(
                "rounded-[3px] box-decoration-clone transition-[background-color,box-shadow] duration-150",
                segment.id === activeId &&
                  "bg-marker text-marker-ink shadow-[0_0_0_2px_var(--marker)]",
              )}
            >
              {highlight(
                segment.text,
                matches?.filter((match) => match.segment === position),
                current,
                segment.id === activeId,
              )}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
});

function highlight(
  text: string,
  matches: IndexedMatch[] | undefined,
  current: number | undefined,
  /** The segment already has the marker background. */
  spoken: boolean,
): ReactNode {
  if (!matches?.length) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of matches) {
    if (match.start > last) parts.push(text.slice(last, match.start));
    parts.push(
      <mark
        key={match.index}
        data-match={match.index}
        data-current={match.index === current ? "" : undefined}
        className={tw(
          // Clears the sticky tabs and search row above and the player bar
          // below when scrolled to.
          "rounded-[2px] scroll-mt-28 scroll-mb-32 box-decoration-clone",
          // A marker on a marker disappears; underline matches instead.
          spoken &&
            "bg-transparent underline decoration-ink decoration-2 underline-offset-2",
          // Thin and flush, so it doesn't crowd the neighbouring words.
          match.index === current &&
            "outline-[1.5px] outline-offset-0 outline-ink",
        )}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    last = match.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function JumpPill({
  direction,
  layout,
  onClick,
}: {
  direction: "up" | "down";
  layout: "rail" | "page";
  onClick: () => void;
}) {
  const Icon = direction === "up" ? ArrowUp : ArrowDown;
  return (
    // A zero-height sticky row keeps the pill at the bottom edge of the view
    // without taking space at the end of the transcript.
    <div
      className={tw(
        "pointer-events-none sticky flex h-0 justify-center",
        layout === "rail"
          ? "bottom-3"
          : "bottom-[calc(var(--player-height,0px)+0.75rem)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={tw(
          "pointer-events-auto inline-flex h-8 -translate-y-full animate-toast-in items-center gap-1.5 rounded-chip bg-ink px-3 type-small font-medium text-sheet shadow-float transition-colors hover:bg-ink/85",
          "focus-visible:outline-offset-2",
        )}
      >
        <Icon aria-hidden="true" size={14} />
        Jump to current
      </button>
    </div>
  );
}

// Viewport helpers. The visible part of the window ends where the sticky
// player bar starts; in the tab it begins below the sticky search row (and
// the tabs above it). The rail is also cut off by the window and the bar.
function viewOf(scroller: HTMLElement | null) {
  const barTop =
    document.querySelector("[data-player-bar]")?.getBoundingClientRect().top ??
    0;
  const bottom =
    barTop > 0 ? Math.min(barTop, window.innerHeight) : window.innerHeight;
  if (!scroller) {
    const top = Math.max(
      0,
      document
        .querySelector("[data-transcript-search]")
        ?.getBoundingClientRect().bottom ?? 0,
    );
    return { top, bottom };
  }
  const rect = scroller.getBoundingClientRect();
  return { top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, bottom) };
}

function isFullyVisible(element: Element, scroller: HTMLElement | null) {
  const rect = element.getBoundingClientRect();
  const view = viewOf(scroller);
  return rect.top >= view.top && rect.bottom <= view.bottom;
}

function outOfView(
  element: Element,
  scroller: HTMLElement | null,
): "up" | "down" | null {
  const rect = element.getBoundingClientRect();
  const view = viewOf(scroller);
  if (rect.bottom <= view.top) return "up";
  if (rect.top >= view.bottom) return "down";
  return null;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

function centerIn(element: HTMLElement, scroller: HTMLElement | null) {
  const behavior = scrollBehavior();
  if (!scroller) {
    element.scrollIntoView({ block: "center", behavior });
    return;
  }
  // Scrolling only the rail; scrollIntoView would also move the page.
  const box = scroller.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = Math.max(
    0,
    scroller.scrollTop + (rect.top - box.top) - (box.height - rect.height) / 2,
  );
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ top, behavior });
  } else {
    scroller.scrollTop = top;
  }
}
