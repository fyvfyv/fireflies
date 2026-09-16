import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAudioUrl } from "@/lib/api";

export type PlayerStatus = "idle" | "loading" | "ready" | "error";

/** An explicit seek; `id` changes on every one, even to the same spot. */
export type PlayerJump = { seconds: number; id: number };

type PlayerState = {
  status: PlayerStatus;
  playing: boolean;
  /** Seconds; 0 while unknown. */
  duration: number;
  rate: number;
  jump: PlayerJump | null;
  /** False without a provider or once the audio failed for good. */
  available: boolean;
};

export type PlayerActions = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number, options?: { play?: boolean }) => void;
  skip: (deltaSeconds: number) => void;
  setRate: (rate: number) => void;
};

export type Player = PlayerState & PlayerActions & { currentTime: number };

const noop = () => {};
const inertActions: PlayerActions = {
  play: noop,
  pause: noop,
  toggle: noop,
  seek: noop,
  skip: noop,
  setRate: noop,
};
const inertState: PlayerState = {
  status: "idle",
  playing: false,
  duration: 0,
  rate: 1,
  jump: null,
  available: false,
};

// Split so that components which only start playback (timestamp marks) don't
// re-render on every time update.
const StateContext = createContext(inertState);
const TimeContext = createContext(0);
const ActionsContext = createContext(inertActions);

export function usePlayer(): Player {
  return {
    ...use(StateContext),
    ...use(ActionsContext),
    currentTime: use(TimeContext),
  };
}

export function usePlayerActions(): PlayerActions {
  return use(ActionsContext);
}

// HTMLMediaElement.readyState values.
const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;

const hasSource = (audio: HTMLAudioElement) => audio.hasAttribute("src");

// A signed URL this close to its expiry is fetched again instead of used.
const URL_EXPIRY_MARGIN_MS = 60_000;
// Where idle callbacks don't exist (Safari), the URL is warmed after this.
const WARM_UP_DELAY_MS = 1_500;

type UrlRequest = {
  promise: Promise<string>;
  /** Epoch ms; null until the request resolves. */
  expiresAt: number | null;
};

const expiresSoon = ({ expiresAt }: UrlRequest) =>
  expiresAt !== null && expiresAt - Date.now() < URL_EXPIRY_MARGIN_MS;

type PlayerProviderProps = {
  meetingId: string;
  /** The meeting's measured duration; WebM recordings often report Infinity. */
  durationSeconds: number | null;
  /** Space, j and l anywhere on the page. */
  shortcuts?: boolean;
  children: ReactNode;
};

export function PlayerProvider({
  meetingId,
  durationSeconds,
  shortcuts = true,
  children,
}: PlayerProviderProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatusState] = useState<PlayerStatus>("idle");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [jump, setJump] = useState<PlayerJump | null>(null);

  const duration =
    durationSeconds !== null && durationSeconds > 0
      ? durationSeconds
      : mediaDuration;

  // Event handlers and actions read these instead of state, so the actions
  // object stays stable for the lifetime of the provider.
  const statusRef = useRef(status);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const timeRef = useRef(0);
  const jumpId = useRef(0);
  const wantsPlay = useRef(false);
  const pendingSeek = useRef<number | null>(null);
  const urlRequest = useRef<UrlRequest | null>(null);
  const refreshed = useRef(false);
  // Set once the provider unmounts; pending URL requests must not touch the
  // element after that.
  const disposed = useRef(false);

  const setStatus = useCallback((next: PlayerStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const fail = useCallback(() => {
    wantsPlay.current = false;
    setPlaying(false);
    setStatus("error");
  }, [setStatus]);

  // The URL is signed and expires, so it is only requested when needed, and
  // a warmed one that is about to expire is replaced before use.
  const requestUrl = useCallback(() => {
    const cached = urlRequest.current;
    if (cached && !expiresSoon(cached)) return cached.promise;
    const request: UrlRequest = {
      expiresAt: null,
      promise: getAudioUrl(meetingId).then((audio) => {
        request.expiresAt = Date.parse(audio.expiresAt);
        return audio.url;
      }),
    };
    urlRequest.current = request;
    // Forget a failed request so a later attempt asks again.
    request.promise.catch(() => {
      if (urlRequest.current === request) urlRequest.current = null;
    });
    return request.promise;
  }, [meetingId]);

  const startPlayback = useCallback(
    async (audio: HTMLAudioElement) => {
      if (audio.readyState < HAVE_FUTURE_DATA) setStatus("loading");
      try {
        await audio.play();
      } catch (err) {
        // AbortError: a pause or a new source interrupted play(). Nothing to
        // report.
        // NotSupportedError: the source didn't load. The element's error
        // event already refreshes the URL (and resumes, since playback is
        // still wanted) or reports the audio unavailable.
        if (
          err instanceof DOMException &&
          (err.name === "AbortError" || err.name === "NotSupportedError")
        ) {
          return;
        }
        // Autoplay policy or similar: stay paused. Broken media reports
        // itself through the element's error event instead.
        wantsPlay.current = false;
        setPlaying(false);
        if (statusRef.current === "loading") {
          setStatus(hasSource(audio) ? "ready" : "idle");
        }
      }
    },
    [setStatus],
  );

  const actions = useMemo<PlayerActions>(() => {
    const play = () => {
      const audio = audioRef.current;
      if (!audio || statusRef.current === "error") return;
      wantsPlay.current = true;
      if (hasSource(audio)) {
        void startPlayback(audio);
        return;
      }
      setStatus("loading");
      requestUrl().then(
        (url) => {
          if (disposed.current) return;
          if (!hasSource(audio)) audio.src = url;
          if (wantsPlay.current) void startPlayback(audio);
        },
        () => {
          if (!disposed.current) fail();
        },
      );
    };

    const pause = () => {
      wantsPlay.current = false;
      audioRef.current?.pause();
      if (statusRef.current === "loading") {
        setStatus(
          audioRef.current && hasSource(audioRef.current) ? "ready" : "idle",
        );
      }
    };

    const seek: PlayerActions["seek"] = (seconds, options) => {
      if (!Number.isFinite(seconds)) return;
      const max = durationRef.current > 0 ? durationRef.current : Infinity;
      const target = Math.min(Math.max(seconds, 0), max);
      timeRef.current = target;
      setCurrentTime(target);
      jumpId.current += 1;
      setJump({ seconds: target, id: jumpId.current });
      const audio = audioRef.current;
      if (audio && hasSource(audio) && audio.readyState >= HAVE_METADATA) {
        pendingSeek.current = null;
        audio.currentTime = target;
      } else {
        // Applied once the element knows its metadata.
        pendingSeek.current = target;
      }
      if (options?.play) play();
    };

    return {
      play,
      pause,
      toggle: () => (wantsPlay.current ? pause() : play()),
      seek,
      skip: (delta) => seek(timeRef.current + delta),
      setRate: (next) => {
        const audio = audioRef.current;
        if (audio) {
          // The default rate survives a source change (the URL refresh).
          audio.defaultPlaybackRate = next;
          audio.playbackRate = next;
        }
        setRateState(next);
      },
    };
  }, [requestUrl, startPlayback, setStatus, fail]);

  const onError = () => {
    const audio = audioRef.current;
    if (!audio || !hasSource(audio) || statusRef.current === "error") return;
    // The first failure is most likely an expired signature: get a new URL
    // and resume from the same spot.
    if (refreshed.current) {
      fail();
      return;
    }
    refreshed.current = true;
    const resumeAt = timeRef.current;
    urlRequest.current = null;
    setStatus("loading");
    requestUrl().then(
      (url) => {
        if (disposed.current) return;
        pendingSeek.current = resumeAt;
        audio.src = url;
        if (wantsPlay.current) void startPlayback(audio);
      },
      () => {
        if (!disposed.current) fail();
      },
    );
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (pendingSeek.current !== null) {
      audio.currentTime = pendingSeek.current;
      pendingSeek.current = null;
    }
    readMediaDuration();
    if (!wantsPlay.current && statusRef.current === "loading") {
      setStatus("ready");
    }
  };

  const readMediaDuration = () => {
    const value = audioRef.current?.duration ?? Number.NaN;
    setMediaDuration(Number.isFinite(value) && value > 0 ? value : 0);
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    // Until a pending seek lands, the element still reports the old spot.
    if (!audio || pendingSeek.current !== null) return;
    timeRef.current = audio.currentTime;
    setCurrentTime(audio.currentTime);
  };

  const markReady = () => {
    if (statusRef.current === "loading") setStatus("ready");
  };

  // A detached <audio> keeps playing, so leaving the page must stop it.
  // Resetting the flag on mount keeps StrictMode's remount working.
  useEffect(() => {
    disposed.current = false;
    const audio = audioRef.current;
    return () => {
      disposed.current = true;
      wantsPlay.current = false;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      // Aborts whatever the element was still downloading.
      audio.load();
    };
  }, []);

  useEffect(() => {
    // Warm the URL once the page settles so the first play starts sooner.
    const warm = () => {
      requestUrl().catch(noop);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 5_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(warm, WARM_UP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [requestUrl]);

  useEffect(() => {
    if (!shortcuts) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      if (event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (event.key === " ") {
        if (target && isControl(target)) return;
        event.preventDefault();
        actions.toggle();
      } else if (event.key === "j" || event.key === "l") {
        if (target && acceptsTyping(target)) return;
        event.preventDefault();
        actions.skip(event.key === "j" ? -10 : 10);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, actions]);

  const state = useMemo<PlayerState>(
    () => ({
      status,
      playing,
      duration,
      rate,
      jump,
      available: status !== "error",
    }),
    [status, playing, duration, rate, jump],
  );

  return (
    <ActionsContext value={actions}>
      <StateContext value={state}>
        <TimeContext value={currentTime}>
          {children}
          {/* biome-ignore lint/a11y/useMediaCaption: the transcript next to the player is the caption */}
          <audio
            ref={audioRef}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPlaying={() => {
              // Playback proves the URL works; a later expiry may refresh again.
              refreshed.current = false;
              setPlaying(true);
              setStatus("ready");
            }}
            onPause={() => {
              // Also covers pauses from outside the page (media keys), so the
              // next toggle plays instead of pausing again.
              wantsPlay.current = false;
              setPlaying(false);
            }}
            onEnded={() => {
              wantsPlay.current = false;
              setPlaying(false);
            }}
            onWaiting={() => {
              if (wantsPlay.current) setStatus("loading");
            }}
            onCanPlay={markReady}
            onLoadedMetadata={onLoadedMetadata}
            onDurationChange={readMediaDuration}
            onTimeUpdate={onTimeUpdate}
            onRateChange={() =>
              setRateState(audioRef.current?.playbackRate ?? 1)
            }
            onError={onError}
          />
        </TimeContext>
      </StateContext>
    </ActionsContext>
  );
}

// Space belongs to controls that use it (text fields, buttons, links, menus,
// dialogs). The radix slider thumb and tabs ignore Space, so it plays and
// pauses there; radix tabs are buttons, hence the `:not`.
const CONTROLS = [
  "input",
  "textarea",
  "select",
  "button:not([role='tab'])",
  "a[href]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='option']",
  "[role='combobox']",
  "[role='textbox']",
  "[role='menu']",
  "[role^='menuitem']",
  "[role='dialog']",
].join(",");

function isControl(target: Element) {
  return target.closest(CONTROLS) !== null;
}

const NON_TEXT_INPUTS = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
]);

// Letters belong to text entry and to menus (typeahead).
function acceptsTyping(target: Element) {
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(target.type);
  }
  return (
    target.closest(
      "textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='menu'], [role^='menuitem']",
    ) !== null
  );
}
