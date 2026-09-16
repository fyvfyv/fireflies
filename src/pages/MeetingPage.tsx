import type { Meeting, MeetingStatus, Source } from "@shared/schemas";
import { tw } from "@tw";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Download,
  Ellipsis,
  FileAudio,
  FileQuestionMark,
  Languages,
  Link2,
  type LucideIcon,
  Mic,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { BackLink } from "@/components/BackLink";
import { ErrorAlert } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/Menu";
import { Popover, PopoverAnchor } from "@/components/ui/Popover";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toaster";
import { useDocumentTitle } from "@/components/useDocumentTitle";
import { DeleteConfirmContent } from "@/features/meetings/DeleteMeetingButton";
import { FailedBanner } from "@/features/meetings/FailedBanner";
import { sourceLabels } from "@/features/meetings/MeetingList";
import { StatusStepper } from "@/features/meetings/StatusStepper";
import { useAutoProcess } from "@/features/meetings/useAutoProcess";
import { useMeeting } from "@/features/meetings/useMeeting";
import { ActionItems } from "@/features/notes/ActionItems";
import { NotesDocument } from "@/features/notes/NotesDocument";
import { notesToClipboard } from "@/features/notes/notesToClipboard";
import { useCopyAction } from "@/features/notes/useCopyAction";
import { PlayerBar } from "@/features/player/PlayerBar";
import { PlayerProvider } from "@/features/player/PlayerProvider";
import { transcriptForClipboard } from "@/features/transcript/paragraphs";
import { TranscriptPanel } from "@/features/transcript/TranscriptPanel";
import {
  ApiError,
  deleteMeeting,
  errorMessage,
  getAudioUrl,
  processMeeting,
} from "@/lib/api";
import { copyRich, copyText } from "@/lib/clipboard";
import { formatDayTime, formatShortTime } from "@/lib/time";

const isApiStatus = (err: unknown, status: number) =>
  err instanceof ApiError && err.status === status;

// Below this width the transcript moves from the side rail into a tab.
const WIDE_QUERY = "(min-width: 1180px)";
// Where the rail sticks (its `top-4`).
const RAIL_STICKY_TOP_PX = 16;

type Tab = "notes" | "actions" | "transcript";
const NARROW_TABS: readonly Tab[] = ["notes", "actions", "transcript"];
const WIDE_TABS: readonly Tab[] = ["notes", "actions"];

export function MeetingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // The retry and notes requests only return when the run ends (up to
  // 300 s), so the page polls meanwhile to show the steps as they happen.
  const { meeting, notFound, error, refetch } = useMeeting(id, {
    keepPolling: retrying || regenerating,
  });
  useDocumentTitle(
    notFound
      ? "Meeting not found – Recap"
      : meeting
        ? `${meeting.title} – Recap`
        : "Meeting – Recap",
  );
  const startError = useAutoProcess(meeting, refetch);
  const { toast } = useToast();

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await processMeeting(id);
    } catch (err) {
      // 409: another tab already restarted the run, and polling shows it.
      if (!isApiStatus(err, 409)) setRetryError(errorMessage(err));
    }
    await refetch();
    setRetrying(false);
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMeeting(id);
    } catch (err) {
      if (!isApiStatus(err, 404)) {
        setDeleteError(errorMessage(err));
        setDeleting(false);
        return;
      }
    }
    // The toast store is module-level and the Toaster lives in the layout,
    // so the confirmation survives the route change.
    toast({ title: "Meeting deleted" });
    // Replaced so Back doesn't return to a page that no longer exists.
    navigate("/", { replace: true });
  };

  if (notFound) return <NotFoundState />;

  if (!meeting) {
    return (
      <div className={tw("px-4 pt-3 pb-10 md:px-8 md:pt-5")}>
        {error ? (
          <div className={tw("space-y-4")}>
            <BackLink label="Meetings" />
            <ErrorAlert
              message={error}
              action={{ label: "Try again", onClick: refetch }}
            />
          </div>
        ) : (
          <MeetingSkeleton />
        )}
      </div>
    );
  }

  const problem = meeting.status === "failed" || meeting.stalled;
  // Nothing else would start a meeting whose automatic start failed.
  const waitingError =
    !problem && meeting.status === "uploaded"
      ? (retryError ?? startError)
      : null;
  const hasAudio = Boolean(meeting.audioPathname);

  return (
    <PlayerProvider
      key={meeting.id}
      meetingId={meeting.id}
      durationSeconds={meeting.durationSeconds}
      shortcuts={hasAudio}
    >
      <MeetingView
        meeting={meeting}
        loadError={error}
        onReload={refetch}
        hasAudio={hasAudio}
        notice={
          problem ? (
            <FailedBanner
              meeting={meeting}
              onRetry={retry}
              onDelete={remove}
              retrying={retrying}
              retryError={retryError}
              deleting={deleting}
              deleteError={deleteError}
            />
          ) : waitingError ? (
            <ErrorAlert
              message={waitingError}
              action={retrying ? undefined : { label: "Retry", onClick: retry }}
            />
          ) : null
        }
        onRegeneratingChange={setRegenerating}
        remove={{
          onConfirm: remove,
          deleting,
          error: deleteError,
          onOpen: () => setDeleteError(null),
        }}
      />
    </PlayerProvider>
  );
}

type RemoveControls = {
  onConfirm: () => void;
  deleting: boolean;
  error: string | null;
  onOpen: () => void;
};

function MeetingView({
  meeting,
  loadError,
  onReload,
  hasAudio,
  notice,
  onRegeneratingChange,
  remove,
}: {
  meeting: Meeting;
  loadError: string | null;
  onReload: () => Promise<void>;
  hasAudio: boolean;
  /**
   * A failed or interrupted run, or a start that failed. Shown above the
   * tabs, since no tab has its content until it is resolved.
   */
  notice: ReactNode;
  onRegeneratingChange: (busy: boolean) => void;
  remove: RemoveControls;
}) {
  const titleId = useId();
  const wide = useMediaQuery(WIDE_QUERY);
  const [tab, setTab] = useHashTab(wide ? WIDE_TABS : NARROW_TABS);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState(0);
  const announcement = useReadyAnnouncement(meeting.status);

  const { summary } = meeting;
  const done = meeting.status === "done";
  const problem = meeting.status === "failed" || meeting.stalled;
  const sections = summary?.notes ?? [];
  const actionItems = summary?.actionItems ?? [];

  const transcript = (
    <TranscriptPanel
      text={meeting.transcriptText}
      segments={meeting.transcriptSegments}
      transcribing={!problem}
      layout={wide ? "rail" : "page"}
      className={tw(wide && "flex-1")}
    />
  );
  const panelClass = tw("px-5 pt-7 pb-10 md:px-10 md:pt-8 md:pb-12");

  const selectTab = (value: string) => {
    setTab(value);
    // With the tab row stuck to the top, a new tab should start at its own
    // top rather than at the old tab's scroll depth.
    const root = tabsRef.current;
    if (!wide && root && root.getBoundingClientRect().top < 0) {
      requestAnimationFrame(() => root.scrollIntoView({ block: "start" }));
    }
  };

  return (
    <div
      // The header is 56px plus its hairline; filling the rest keeps the
      // player bar at the bottom edge on short pages.
      className={tw("flex min-h-[calc(100dvh-3.5rem-1px)] flex-col")}
      style={{ "--player-height": `${playerHeight}px` } as CSSProperties}
    >
      <p role="status" className={tw("sr-only")}>
        {announcement}
      </p>
      <div className={tw("flex-1 px-4 pt-3 pb-8 md:px-8 md:pt-4 md:pb-10")}>
        <HeaderRow meeting={meeting} remove={remove} />
        {loadError && (
          <div className={tw("mt-3")}>
            <ErrorAlert
              message={loadError}
              action={{ label: "Try again", onClick: onReload }}
            />
          </div>
        )}
        <div
          className={tw(
            "mt-3 grid items-start gap-6 md:mt-4",
            "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]",
          )}
        >
          <article
            aria-labelledby={titleId}
            className={tw(
              "-mx-4 min-w-0 border-y border-rule bg-sheet sm:mx-0 sm:rounded-sheet sm:border-x",
            )}
          >
            <TitleBlock meeting={meeting} titleId={titleId} />
            {notice && <div className={tw("mt-6 px-5 md:px-10")}>{notice}</div>}
            <Tabs
              ref={tabsRef}
              value={tab}
              onValueChange={selectTab}
              className={tw("mt-6 md:mt-8")}
            >
              <TabsList
                aria-label="Meeting sections"
                // Below the rail breakpoint the tabs are the page's only
                // navigation, so they stay at hand while scrolling.
                className={tw(
                  "px-5 md:px-10 max-[1180px]:sticky max-[1180px]:top-0 max-[1180px]:z-20 max-[1180px]:bg-sheet",
                )}
              >
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger
                  value="actions"
                  count={summary ? actionItems.length : undefined}
                >
                  Action items
                </TabsTrigger>
                {!wide && (
                  <TabsTrigger value="transcript">Transcript</TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="notes" className={panelClass}>
                {!done ? (
                  <ProcessingView meeting={meeting} problem={problem} />
                ) : summary ? (
                  <NotesDocument
                    meeting={meeting}
                    onUpdated={onReload}
                    onRegeneratingChange={onRegeneratingChange}
                  />
                ) : (
                  <QuietNote>There are no notes for this meeting.</QuietNote>
                )}
              </TabsContent>
              <TabsContent value="actions" className={panelClass}>
                {summary ? (
                  <ActionItems
                    meetingId={meeting.id}
                    items={actionItems}
                    headingLevel={2}
                  />
                ) : (
                  <QuietNote>
                    Action items appear once the notes are written.
                  </QuietNote>
                )}
              </TabsContent>
              {!wide && (
                <TabsContent value="transcript" className={tw("pt-2 pb-4")}>
                  {transcript}
                </TabsContent>
              )}
            </Tabs>
          </article>
          {wide && <TranscriptRail>{transcript}</TranscriptRail>}
        </div>
      </div>
      {hasAudio && (
        <PlayerBar
          sections={sections}
          actionItems={actionItems}
          onHeightChange={setPlayerHeight}
        />
      )}
    </div>
  );
}

/**
 * The rail sticks near the top of the window but starts lower, below the
 * page header. Its height follows its current top, so its end (and the jump
 * pill there) stays above the player bar before it sticks too.
 */
function TranscriptRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = Math.max(
        rail.getBoundingClientRect().top,
        RAIL_STICKY_TOP_PX,
      );
      rail.style.setProperty("--rail-top", `${Math.round(top)}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // Content above the rail (an alert, a banner) moves it without a scroll.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <aside
      ref={ref}
      className={tw(
        // Ends 1rem above the player bar.
        "sticky top-4 flex max-h-[calc(100dvh-var(--player-height)-var(--rail-top,1rem)-1rem)] min-h-0 flex-col rounded-sheet border border-rule bg-sheet",
      )}
    >
      {children}
    </aside>
  );
}

function QuietNote({ children }: { children: ReactNode }) {
  return (
    <p className={tw("py-8 text-center type-body text-graphite")}>{children}</p>
  );
}

function HeaderRow({
  meeting,
  remove,
}: {
  meeting: Meeting;
  remove: RemoveControls;
}) {
  const location = useLocation();
  const link = useCopyAction(
    () =>
      copyText(`${window.location.origin}${location.pathname}${location.hash}`),
    { success: "Link copied", failure: "Couldn't copy the link. Try again." },
  );

  return (
    <div className={tw("flex h-10 items-center justify-between gap-3")}>
      <BackLink label="Meetings" />
      <div className={tw("flex items-center gap-0.5")}>
        <IconButton label="Copy link" onClick={link.copy}>
          {link.copied ? <Check className={tw("text-ok")} /> : <Link2 />}
        </IconButton>
        <MeetingMenu meeting={meeting} remove={remove} />
      </div>
    </div>
  );
}

function MeetingMenu({
  meeting,
  remove,
}: {
  meeting: Meeting;
  remove: RemoveControls;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set when the delete item opens the confirmation, so the closing menu
  // doesn't pull focus back to its trigger.
  const handingOff = useRef(false);

  const notes = useCopyAction(
    () => {
      const { html, markdown } = notesToClipboard(meeting);
      return copyRich({ html, text: markdown });
    },
    { success: "Notes copied", failure: "Couldn't copy the notes. Try again." },
  );
  const transcript = useCopyAction(
    () =>
      copyText(
        transcriptForClipboard(
          meeting.transcriptText ?? "",
          meeting.transcriptSegments,
        ),
      ),
    {
      success: "Transcript copied",
      failure: "Couldn't copy the transcript. Try again.",
    },
  );

  const openConfirm = (open: boolean) => {
    if (open) remove.onOpen();
    setConfirming(open);
  };

  const downloadAudio = async () => {
    // Opened before the request: browsers block windows opened after an await.
    const tab = window.open("", "_blank");
    // The signed URL is another origin; it gets no handle back to this page.
    if (tab) tab.opener = null;
    try {
      const { url } = await getAudioUrl(meeting.id);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch (err) {
      tab?.close();
      toast({ title: errorMessage(err), tone: "danger" });
    }
  };

  return (
    <Popover open={confirming} onOpenChange={openConfirm}>
      {/* Non-modal, so the confirmation can take focus as the menu closes. */}
      <Menu modal={false}>
        <PopoverAnchor asChild>
          <MenuTrigger asChild>
            <IconButton ref={triggerRef} label="More actions">
              <Ellipsis />
            </IconButton>
          </MenuTrigger>
        </PopoverAnchor>
        <MenuContent
          onCloseAutoFocus={(event) => {
            if (!handingOff.current) return;
            handingOff.current = false;
            event.preventDefault();
          }}
        >
          <MenuItem disabled={!meeting.summary} onSelect={notes.copy}>
            <Copy aria-hidden="true" />
            Copy notes
          </MenuItem>
          <MenuItem
            disabled={!meeting.transcriptText?.trim()}
            onSelect={transcript.copy}
          >
            <Copy aria-hidden="true" />
            Copy transcript
          </MenuItem>
          <MenuItem onSelect={downloadAudio}>
            <Download aria-hidden="true" />
            Download audio
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            tone="danger"
            onSelect={() => {
              handingOff.current = true;
              openConfirm(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete meeting
          </MenuItem>
        </MenuContent>
      </Menu>
      <DeleteConfirmContent
        onConfirm={remove.onConfirm}
        deleting={remove.deleting}
        error={remove.error}
        // There is no popover trigger to return to; the menu button stands in.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </Popover>
  );
}

function TitleBlock({
  meeting,
  titleId,
}: {
  meeting: Meeting;
  titleId: string;
}) {
  return (
    <div className={tw("px-5 pt-6 md:px-10 md:pt-9")}>
      <h1
        id={titleId}
        className={tw("type-title text-balance break-words text-ink")}
      >
        {meeting.title}
      </h1>
      <MeetingMeta meeting={meeting} />
    </div>
  );
}

const languageNames = new Intl.DisplayNames("en", { type: "language" });

// Whisper-style providers may report a lowercase name ("english") instead of
// a code, which DisplayNames returns unchanged or rejects.
function languageName(language: string): string {
  try {
    const name = languageNames.of(language);
    if (name && name !== language) return name;
  } catch {
    // Not a valid language tag; fall back to what the provider reported.
  }
  return language.charAt(0).toUpperCase() + language.slice(1);
}

const sourceIcons: Record<Source, LucideIcon> = {
  mic: Mic,
  upload: FileAudio,
  demo: Sparkles,
};

function MeetingMeta({ meeting }: { meeting: Meeting }) {
  return (
    <ul
      aria-label="Meeting details"
      className={tw(
        "mt-3 flex flex-wrap gap-x-5 gap-y-1.5 type-small text-graphite",
      )}
    >
      {meeting.durationSeconds !== null && (
        <MetaItem icon={Clock} label="Duration">
          {formatShortTime(meeting.durationSeconds)}
        </MetaItem>
      )}
      <MetaItem icon={CalendarDays} label="Recorded">
        {formatDayTime(new Date(meeting.createdAt))}
      </MetaItem>
      {meeting.language && (
        <MetaItem icon={Languages} label="Language">
          {languageName(meeting.language)}
        </MetaItem>
      )}
      <MetaItem icon={sourceIcons[meeting.source]} label="Source">
        {sourceLabels[meeting.source]}
      </MetaItem>
    </ul>
  );
}

function MetaItem({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className={tw("flex items-center gap-1.5")}>
      <Icon aria-hidden="true" className={tw("shrink-0 text-faint")} />
      <span className={tw("sr-only")}>{label}: </span>
      <span>{children}</span>
    </li>
  );
}

function ProcessingView({
  meeting,
  problem,
}: {
  meeting: Meeting;
  /** Failed or stalled: nothing is on its way, so no skeleton. */
  problem: boolean;
}) {
  return (
    <div className={tw("space-y-7")}>
      <StatusStepper
        meeting={meeting}
        since={meeting.processingStartedAt ?? meeting.createdAt}
        className={tw("max-w-xl")}
      />
      {!problem && <NotesSkeleton />}
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div aria-busy="true" className={tw("space-y-9 border-t border-rule pt-8")}>
      <p className={tw("sr-only")}>Loading notes…</p>
      <div className={tw("space-y-3")}>
        <Skeleton className={tw("h-4 w-11/12")} />
        <Skeleton className={tw("h-4 w-4/5")} />
        <div className={tw("flex gap-1.5 pt-2")}>
          <Skeleton className={tw("h-5 w-16 rounded-chip")} />
          <Skeleton className={tw("h-5 w-20 rounded-chip")} />
          <Skeleton className={tw("h-5 w-14 rounded-chip")} />
        </div>
      </div>
      {["w-2/5", "w-1/3"].map((width) => (
        <div key={width} className={tw("flex gap-3.5 md:-ml-[1.125rem]")}>
          <Skeleton className={tw("mt-1 h-4 w-1 rounded-full")} />
          <div className={tw("flex-1 space-y-3")}>
            <Skeleton className={tw("h-5", width)} />
            <Skeleton className={tw("h-3.5 w-3/4")} />
            <Skeleton className={tw("h-3.5 w-5/6")} />
            <Skeleton className={tw("h-3.5 w-2/3")} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MeetingSkeleton() {
  return (
    <div aria-busy="true">
      <p className={tw("sr-only")}>Loading meeting…</p>
      <div className={tw("flex h-10 items-center")}>
        <Skeleton className={tw("h-4 w-24")} />
      </div>
      <div
        className={tw(
          "mt-3 grid items-start gap-6 md:mt-4 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]",
        )}
      >
        <div
          className={tw(
            "-mx-4 border-y border-rule bg-sheet px-5 pt-6 pb-12 sm:mx-0 sm:rounded-sheet sm:border-x md:px-10 md:pt-9",
          )}
        >
          <Skeleton className={tw("h-8 w-2/3")} />
          <div className={tw("mt-4 flex gap-5")}>
            <Skeleton className={tw("h-4 w-12")} />
            <Skeleton className={tw("h-4 w-28")} />
            <Skeleton className={tw("h-4 w-16")} />
          </div>
          <div className={tw("mt-8 flex gap-6 border-b border-rule pb-3")}>
            <Skeleton className={tw("h-4 w-12")} />
            <Skeleton className={tw("h-4 w-24")} />
          </div>
          <div className={tw("mt-8 space-y-3")}>
            <Skeleton className={tw("h-4 w-11/12")} />
            <Skeleton className={tw("h-4 w-4/5")} />
            <Skeleton className={tw("h-4 w-3/5")} />
          </div>
        </div>
        <div
          className={tw(
            "hidden space-y-3 rounded-sheet border border-rule bg-sheet p-6 min-[1180px]:block",
          )}
        >
          <Skeleton className={tw("h-5 w-24")} />
          <Skeleton className={tw("h-10 w-full rounded-control")} />
          <Skeleton className={tw("h-3.5 w-full")} />
          <Skeleton className={tw("h-3.5 w-5/6")} />
          <Skeleton className={tw("h-3.5 w-4/6")} />
        </div>
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div
      className={tw(
        "mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center md:py-28",
      )}
    >
      <div
        className={tw(
          "mb-5 grid size-12 place-items-center rounded-full bg-sunken text-graphite",
        )}
      >
        <FileQuestionMark aria-hidden="true" size={22} />
      </div>
      <h1 className={tw("type-title")}>Meeting not found</h1>
      <p className={tw("mt-2 type-body text-graphite")}>
        It may have been deleted, or the link is incomplete.
      </p>
      <Button asChild variant="secondary" className={tw("mt-6")}>
        <Link to="/">
          <ArrowLeft aria-hidden="true" />
          Back to meetings
        </Link>
      </Button>
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The selected tab lives in the URL hash so a link opens the same view.
 * Unknown hashes (and the transcript on wide screens) fall back to notes.
 */
function useHashTab(allowed: readonly Tab[]): [Tab, (value: string) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = location.hash.slice(1);
  const tab = allowed.find((value) => value === requested) ?? "notes";
  const select = (value: string) => {
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: `#${value}`,
      },
      // Tabs are views of one page; Back should leave the meeting.
      { replace: true, preventScrollReset: true },
    );
  };
  return [tab, select];
}

/** Announces notes that finish while the page is open. */
function useReadyAnnouncement(status: MeetingStatus): string {
  const [seen, setSeen] = useState(status);
  const [message, setMessage] = useState("");
  if (seen !== status) {
    setSeen(status);
    setMessage(status === "done" ? "Notes are ready." : "");
  }
  return message;
}
