import type { AudioUrl } from "@shared/schemas";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getAudioUrl } from "@/lib/api";
import { PlayerProvider, usePlayer } from "./PlayerProvider";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

const mockedAudioUrl = vi.mocked(getAudioUrl);
const signed = (name: string, validForMs = 60 * 60_000): AudioUrl => ({
  url: `https://blob.test/${name}.webm`,
  expiresAt: new Date(Date.now() + validForMs).toISOString(),
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function setup({
  durationSeconds = 105 as number | null,
  shortcuts = true,
} = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlayerProvider
      meetingId="abc"
      durationSeconds={durationSeconds}
      shortcuts={shortcuts}
    >
      {children}
    </PlayerProvider>
  );
  const hook = renderHook(() => usePlayer(), { wrapper });
  const audio = document.querySelector("audio");
  if (!audio) throw new Error("PlayerProvider rendered no <audio>");
  return { ...hook, audio };
}

const fire = (audio: HTMLAudioElement, type: string) =>
  act(() => {
    audio.dispatchEvent(new Event(type));
  });

function setMedia(audio: HTMLAudioElement, props: Record<string, number>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(audio, key, { value, configurable: true });
  }
}

/** Lets the async URL request and play() settle. */
const settle = () => act(() => Promise.resolve());

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockedAudioUrl.mockReset().mockResolvedValue(signed("first"));
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");
});

describe("PlayerProvider", () => {
  it("starts idle and asks for no audio until playback is wanted", () => {
    const { result, audio } = setup();

    expect(result.current).toMatchObject({
      status: "idle",
      playing: false,
      currentTime: 0,
      duration: 105,
      rate: 1,
      available: true,
    });
    expect(audio).not.toHaveAttribute("src");
    expect(mockedAudioUrl).not.toHaveBeenCalled();
  });

  it("loads the signed URL on the first play and starts playback", async () => {
    const { result, audio } = setup();

    act(() => result.current.play());
    expect(result.current.status).toBe("loading");
    await settle();

    expect(mockedAudioUrl).toHaveBeenCalledWith("abc");
    expect(audio.src).toBe("https://blob.test/first.webm");
    expect(playSpy).toHaveBeenCalledTimes(1);

    fire(audio, "play");
    fire(audio, "playing");
    expect(result.current).toMatchObject({ status: "ready", playing: true });

    fire(audio, "pause");
    expect(result.current.playing).toBe(false);
  });

  it("reuses the URL for later plays", async () => {
    const { result, audio } = setup();

    act(() => result.current.play());
    await settle();
    fire(audio, "playing");
    act(() => result.current.pause());
    act(() => result.current.play());
    await settle();

    expect(mockedAudioUrl).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("toggles between playing and paused", async () => {
    const { result, audio } = setup();

    act(() => result.current.toggle());
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(1);
    fire(audio, "play");

    act(() => result.current.toggle());
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a pause from outside the page as paused", async () => {
    const { result, audio } = setup();
    act(() => result.current.play());
    await settle();
    fire(audio, "play");

    // e.g. the media key on the keyboard.
    fire(audio, "pause");
    act(() => result.current.toggle());
    await settle();

    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("follows the element's position and end", async () => {
    const { result, audio } = setup();
    act(() => result.current.play());
    await settle();
    fire(audio, "play");

    audio.currentTime = 34.2;
    fire(audio, "timeupdate");
    expect(result.current.currentTime).toBe(34.2);

    fire(audio, "ended");
    expect(result.current.playing).toBe(false);
  });

  it("falls back to the element's duration when the meeting has none", async () => {
    const { result, audio } = setup({ durationSeconds: null });
    expect(result.current.duration).toBe(0);

    // MediaRecorder files report Infinity until they are fully read.
    setMedia(audio, { duration: Number.POSITIVE_INFINITY });
    fire(audio, "loadedmetadata");
    expect(result.current.duration).toBe(0);

    setMedia(audio, { duration: 90.5 });
    fire(audio, "durationchange");
    expect(result.current.duration).toBe(90.5);
  });

  it("prefers the meeting's duration over the element's", () => {
    const { result, audio } = setup({ durationSeconds: 105 });

    setMedia(audio, { duration: 104.2 });
    fire(audio, "durationchange");

    expect(result.current.duration).toBe(105);
  });

  it("remembers a seek made before the audio loads", async () => {
    const { result, audio } = setup();

    act(() => result.current.seek(30));
    expect(result.current.currentTime).toBe(30);
    expect(mockedAudioUrl).not.toHaveBeenCalled();

    act(() => result.current.play());
    await settle();
    // A stale position from the element must not undo the pending seek.
    fire(audio, "timeupdate");
    expect(result.current.currentTime).toBe(30);

    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(30);
  });

  it("seeks a loaded element directly and can start playback", async () => {
    const { result, audio } = setup();
    act(() => result.current.play());
    await settle();
    setMedia(audio, { readyState: 4 });
    fire(audio, "canplay");
    act(() => result.current.pause());

    act(() => result.current.seek(50, { play: true }));
    await settle();

    expect(audio.currentTime).toBe(50);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("keeps seeks and skips inside the recording", () => {
    const { result } = setup();

    act(() => result.current.seek(-5));
    expect(result.current.currentTime).toBe(0);
    act(() => result.current.seek(500));
    expect(result.current.currentTime).toBe(105);
    act(() => result.current.skip(-10));
    expect(result.current.currentTime).toBe(95);
    act(() => result.current.skip(-10));
    act(() => result.current.skip(-10));
    expect(result.current.currentTime).toBe(75);
    act(() => result.current.skip(60));
    expect(result.current.currentTime).toBe(105);
  });

  it("numbers every explicit jump so listeners can react to repeats", () => {
    const { result } = setup();
    expect(result.current.jump).toBeNull();

    act(() => result.current.seek(12));
    expect(result.current.jump).toEqual({ seconds: 12, id: 1 });
    act(() => result.current.seek(12));
    expect(result.current.jump).toEqual({ seconds: 12, id: 2 });
  });

  it("changes the playback rate", () => {
    const { result, audio } = setup();

    act(() => result.current.setRate(1.5));

    expect(audio.playbackRate).toBe(1.5);
    expect(audio.defaultPlaybackRate).toBe(1.5);
    expect(result.current.rate).toBe(1.5);
  });

  it("refreshes an expired URL once, then reports the audio unavailable", async () => {
    mockedAudioUrl
      .mockResolvedValueOnce(signed("first"))
      .mockResolvedValueOnce(signed("second"));
    const { result, audio } = setup();
    act(() => result.current.play());
    await settle();
    audio.currentTime = 20;
    fire(audio, "timeupdate");

    fire(audio, "error");
    await settle();

    expect(mockedAudioUrl).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe("https://blob.test/second.webm");
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("loading");
    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(20);

    fire(audio, "error");
    await settle();

    expect(mockedAudioUrl).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      status: "error",
      playing: false,
      available: false,
    });

    act(() => result.current.play());
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("refreshes again after the new URL played", async () => {
    mockedAudioUrl
      .mockResolvedValueOnce(signed("first"))
      .mockResolvedValueOnce(signed("second"))
      .mockResolvedValueOnce(signed("third"));
    const { result, audio } = setup();
    act(() => result.current.play());
    await settle();

    fire(audio, "error");
    await settle();
    fire(audio, "playing");
    fire(audio, "error");
    await settle();

    expect(audio.src).toBe("https://blob.test/third.webm");
    expect(result.current.status).not.toBe("error");
  });

  it("resumes when the first play finds the URL expired", async () => {
    mockedAudioUrl
      .mockResolvedValueOnce(signed("stale"))
      .mockResolvedValueOnce(signed("fresh"));
    // Browsers report a source they can't load with an error event, then
    // reject the pending play() with NotSupportedError.
    playSpy.mockImplementationOnce(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event("error"));
      return Promise.reject(
        new DOMException("Failed to load", "NotSupportedError"),
      );
    });
    const { result, audio } = setup();

    act(() => result.current.play());
    await settle();
    await settle();

    expect(mockedAudioUrl).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe("https://blob.test/fresh.webm");
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("loading");

    fire(audio, "playing");
    expect(result.current).toMatchObject({ status: "ready", playing: true });
  });

  it("reports audio whose URL can't be fetched", async () => {
    mockedAudioUrl.mockRejectedValue(
      new ApiError({
        status: 404,
        code: "audio_missing",
        message: "Audio not found",
        retryable: false,
      }),
    );
    const { result } = setup();

    act(() => result.current.play());
    await settle();

    expect(result.current.status).toBe("error");
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("stays paused when the browser blocks playback", async () => {
    playSpy.mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    const { result } = setup();

    act(() => result.current.play());
    await settle();
    await settle();

    expect(result.current.playing).toBe(false);
    expect(result.current.status).not.toBe("loading");
  });

  it("stops wanting playback when paused while loading", async () => {
    const { result } = setup();

    act(() => {
      result.current.play();
      result.current.pause();
    });
    await settle();

    expect(playSpy).not.toHaveBeenCalled();
    expect(result.current.status).not.toBe("loading");
  });

  describe("leaving the page", () => {
    it("doesn't start audio whose URL arrives afterwards", async () => {
      const url = deferred<AudioUrl>();
      mockedAudioUrl.mockReturnValue(url.promise);
      const { result, audio, unmount } = setup();

      act(() => result.current.play());
      unmount();
      await act(async () => url.resolve(signed("late")));

      expect(playSpy).not.toHaveBeenCalled();
      expect(audio).not.toHaveAttribute("src");
    });

    it("doesn't resume from a URL refreshed afterwards", async () => {
      const refreshed = deferred<AudioUrl>();
      mockedAudioUrl
        .mockResolvedValueOnce(signed("first"))
        .mockReturnValueOnce(refreshed.promise);
      const { result, audio, unmount } = setup();
      act(() => result.current.play());
      await settle();

      fire(audio, "error");
      unmount();
      await act(async () => refreshed.resolve(signed("second")));

      expect(playSpy).toHaveBeenCalledTimes(1);
      expect(audio).not.toHaveAttribute("src");
    });

    it("stops playback and lets go of the source", async () => {
      const loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load");
      const { result, audio, unmount } = setup();
      act(() => result.current.play());
      await settle();
      fire(audio, "play");

      unmount();

      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(audio).not.toHaveAttribute("src");
      expect(loadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("warming the URL", () => {
    function stubIdleCallbacks() {
      let pending: IdleRequestCallback | null = null;
      vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
        pending = callback;
        return 1;
      });
      vi.stubGlobal("cancelIdleCallback", () => {
        pending = null;
      });
      return () =>
        act(() => pending?.({ didTimeout: false, timeRemaining: () => 50 }));
    }

    it("fetches the URL once the page is idle and plays from it", async () => {
      const runIdle = stubIdleCallbacks();
      const { result, audio } = setup();
      expect(mockedAudioUrl).not.toHaveBeenCalled();

      runIdle();
      await settle();
      expect(mockedAudioUrl).toHaveBeenCalledTimes(1);

      act(() => result.current.play());
      await settle();
      expect(mockedAudioUrl).toHaveBeenCalledTimes(1);
      expect(audio.src).toBe("https://blob.test/first.webm");
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it("asks again when the warmed URL is about to expire", async () => {
      mockedAudioUrl
        .mockResolvedValueOnce(signed("stale", 30_000))
        .mockResolvedValueOnce(signed("fresh"));
      const runIdle = stubIdleCallbacks();
      const { result, audio } = setup();
      runIdle();
      await settle();

      act(() => result.current.play());
      await settle();

      expect(mockedAudioUrl).toHaveBeenCalledTimes(2);
      expect(audio.src).toBe("https://blob.test/fresh.webm");
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it("uses a timer where idle callbacks don't exist", async () => {
      vi.useFakeTimers();
      expect(window.requestIdleCallback).toBeUndefined();
      const { unmount } = setup();

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedAudioUrl).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedAudioUrl).toHaveBeenCalledTimes(1);

      unmount();
      setup().unmount();
      await act(() => vi.advanceTimersByTimeAsync(5_000));
      expect(mockedAudioUrl).toHaveBeenCalledTimes(1);
    });
  });

  it("gives inert defaults without a provider", () => {
    const { result } = renderHook(() => usePlayer());

    expect(result.current).toMatchObject({
      status: "idle",
      available: false,
      duration: 0,
    });
    expect(() => {
      result.current.play();
      result.current.seek(10, { play: true });
      result.current.skip(5);
    }).not.toThrow();
  });
});

describe("player shortcuts", () => {
  function Probe() {
    const { playing } = usePlayer();
    return (
      <>
        <p>{playing ? "Playing" : "Paused"}</p>
        <input aria-label="Search" />
        <button type="button">Other</button>
        {/* Stand-ins for the radix slider thumb and a radix tab. */}
        <span role="slider" aria-valuenow={0} aria-label="Seek" tabIndex={0} />
        <button type="button" role="tab">
          Notes
        </button>
      </>
    );
  }

  function renderWithShortcuts(shortcuts = true) {
    render(
      <PlayerProvider
        meetingId="abc"
        durationSeconds={105}
        shortcuts={shortcuts}
      >
        <Probe />
      </PlayerProvider>,
    );
    const audio = document.querySelector("audio") as HTMLAudioElement;
    return { audio, user: userEvent.setup() };
  }

  it("toggles playback with Space outside controls", async () => {
    const { audio, user } = renderWithShortcuts();

    await user.keyboard(" ");
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(1);
    fire(audio, "play");
    expect(screen.getByText("Playing")).toBeVisible();

    await user.keyboard(" ");
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("leaves Space to inputs and buttons", async () => {
    const { user } = renderWithShortcuts();

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    await user.keyboard(" ");
    screen.getByRole("button", { name: "Other" }).focus();
    await user.keyboard(" ");
    await settle();

    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(" ");
  });

  it.each([
    ["the seek slider", () => screen.getByRole("slider", { name: "Seek" })],
    ["a tab", () => screen.getByRole("tab", { name: "Notes" })],
  ])("toggles playback with Space on %s", async (_, target) => {
    const { user } = renderWithShortcuts();

    act(() => target().focus());
    await user.keyboard(" ");
    await settle();

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("skips with j and l, except while typing", async () => {
    const { audio, user } = renderWithShortcuts();
    act(() => {
      audio.currentTime = 0;
    });

    await user.keyboard("l");
    await user.keyboard("l");
    await user.keyboard("j");
    await settle();
    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(10);

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    await user.keyboard("l");
    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(10);
  });

  it("ignores shortcuts with modifier keys or when turned off", async () => {
    const { user } = renderWithShortcuts(false);

    await user.keyboard(" ");
    await settle();

    expect(playSpy).not.toHaveBeenCalled();
  });

  it("ignores Cmd+L", async () => {
    const { audio, user } = renderWithShortcuts();

    await user.keyboard("{Meta>}l{/Meta}");
    fire(audio, "loadedmetadata");

    expect(audio.currentTime).toBe(0);
  });
});
