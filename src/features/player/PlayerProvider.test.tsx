import type { AudioUrl } from "@shared/schemas";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAudioUrl } from "@/lib/api";
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

function setup(durationSeconds: number | null = 105) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlayerProvider meetingId="abc" durationSeconds={durationSeconds}>
      {children}
    </PlayerProvider>
  );
  const hook = renderHook(() => usePlayer(), { wrapper });
  const audio = document.querySelector("audio") as HTMLAudioElement;
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

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const settle = () => act(() => Promise.resolve());

let playSpy: ReturnType<typeof vi.spyOn>;
let pauseSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockedAudioUrl.mockReset().mockResolvedValue(signed("first"));
  playSpy = vi.spyOn(HTMLMediaElement.prototype, "play");
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause");
});

describe("PlayerProvider", () => {
  it("loads the signed URL on the first play only and follows the element", async () => {
    const { result, audio } = setup();
    expect(result.current).toMatchObject({
      status: "idle",
      playing: false,
      duration: 105,
      available: true,
    });
    expect(audio).not.toHaveAttribute("src");

    act(() => result.current.play());
    expect(result.current.status).toBe("loading");
    await settle();
    expect(mockedAudioUrl).toHaveBeenCalledWith("abc");
    expect(audio.src).toBe("https://blob.test/first.webm");
    expect(playSpy).toHaveBeenCalledTimes(1);

    fire(audio, "play");
    fire(audio, "playing");
    expect(result.current).toMatchObject({ status: "ready", playing: true });
    audio.currentTime = 34.2;
    fire(audio, "timeupdate");
    expect(result.current.currentTime).toBe(34.2);

    fire(audio, "ended");
    expect(result.current.playing).toBe(false);
    act(() => result.current.play());
    await settle();
    expect(mockedAudioUrl).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("toggles, also after a pause from outside the page", async () => {
    const { result, audio } = setup();

    act(() => result.current.toggle());
    await settle();
    fire(audio, "play");
    act(() => result.current.toggle());
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    act(() => result.current.toggle());
    await settle();
    fire(audio, "play");
    fire(audio, "pause");
    act(() => result.current.toggle());
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(3);
  });

  it.each([
    [null, 90.5],
    [105, 105],
  ])("with a meeting duration of %s, reports %s", (meeting, expected) => {
    const { result, audio } = setup(meeting);

    setMedia(audio, { duration: Number.POSITIVE_INFINITY });
    fire(audio, "loadedmetadata");
    expect(result.current.duration).toBe(meeting ?? 0);

    setMedia(audio, { duration: 90.5 });
    fire(audio, "durationchange");
    expect(result.current.duration).toBe(expected);
  });

  it("remembers a seek made before the audio loads", async () => {
    const { result, audio } = setup();

    act(() => result.current.seek(30));
    expect(result.current.currentTime).toBe(30);
    expect(mockedAudioUrl).not.toHaveBeenCalled();

    act(() => result.current.play());
    await settle();
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

  it("keeps seeks and skips inside the recording and numbers every jump", () => {
    const { result } = setup();
    expect(result.current.jump).toBeNull();

    act(() => result.current.seek(-5));
    expect(result.current.currentTime).toBe(0);
    act(() => result.current.seek(500));
    expect(result.current.currentTime).toBe(105);
    act(() => result.current.skip(-10));
    expect(result.current.currentTime).toBe(95);
    act(() => result.current.skip(60));
    expect(result.current.currentTime).toBe(105);

    expect(result.current.jump).toEqual({ seconds: 105, id: 4 });
    act(() => result.current.seek(105));
    expect(result.current.jump).toEqual({ seconds: 105, id: 5 });
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

    expect(audio.src).toBe("https://blob.test/second.webm");
    expect(playSpy).toHaveBeenCalledTimes(2);
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

  it("refreshes again once the new URL has played", async () => {
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
    // Browsers fire `error` for an unloadable source, then reject play() with NotSupportedError.
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

    expect(audio.src).toBe("https://blob.test/fresh.webm");
    expect(playSpy).toHaveBeenCalledTimes(2);
    fire(audio, "playing");
    expect(result.current).toMatchObject({ status: "ready", playing: true });
  });

  it("reports audio whose URL can't be fetched", async () => {
    mockedAudioUrl.mockRejectedValue(new Error("Audio not found"));
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
    expect(result.current.status).toBe("ready");
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
    it.each([
      ["reuses a fresh one", 60 * 60_000, 1, "first"],
      ["replaces one about to expire", 30_000, 2, "fresh"],
    ])(
      "fetches it once the page is idle and %s",
      async (_, validForMs, calls, name) => {
        mockedAudioUrl
          .mockResolvedValueOnce(signed("first", validForMs))
          .mockResolvedValueOnce(signed("fresh"));
        let idle: IdleRequestCallback | undefined;
        vi.stubGlobal(
          "requestIdleCallback",
          (callback: IdleRequestCallback) => {
            idle = callback;
            return 1;
          },
        );
        vi.stubGlobal("cancelIdleCallback", () => {});
        const { result, audio } = setup();
        expect(mockedAudioUrl).not.toHaveBeenCalled();

        act(() => idle?.({ didTimeout: false, timeRemaining: () => 50 }));
        await settle();
        expect(mockedAudioUrl).toHaveBeenCalledTimes(1);

        act(() => result.current.play());
        await settle();
        expect(mockedAudioUrl).toHaveBeenCalledTimes(calls);
        expect(audio.src).toBe(`https://blob.test/${name}.webm`);
      },
    );

    it("uses a timer where idle callbacks don't exist", async () => {
      vi.useFakeTimers();
      expect(window.requestIdleCallback).toBeUndefined();
      setup().unmount();
      setup();

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedAudioUrl).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(mockedAudioUrl).toHaveBeenCalledTimes(1);
    });
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
        <span role="slider" aria-valuenow={0} aria-label="Seek" tabIndex={0} />
        <button type="button" role="tab">
          Notes
        </button>
      </>
    );
  }

  function renderWithShortcuts() {
    render(
      <PlayerProvider meetingId="abc" durationSeconds={105}>
        <Probe />
      </PlayerProvider>,
    );
    const audio = document.querySelector("audio") as HTMLAudioElement;
    return { audio, user: userEvent.setup() };
  }

  it("toggles playback with Space, also on the seek slider and tabs", async () => {
    const { audio, user } = renderWithShortcuts();

    await user.keyboard(" ");
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(1);
    fire(audio, "play");
    expect(screen.getByText("Playing")).toBeVisible();

    act(() => screen.getByRole("slider", { name: "Seek" }).focus());
    await user.keyboard(" ");
    expect(pauseSpy).toHaveBeenCalledTimes(1);

    act(() => screen.getByRole("tab", { name: "Notes" }).focus());
    await user.keyboard(" ");
    await settle();
    expect(playSpy).toHaveBeenCalledTimes(2);
  });

  it("leaves Space to inputs and buttons", async () => {
    const { user } = renderWithShortcuts();

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    await user.keyboard(" ");
    act(() => screen.getByRole("button", { name: "Other" }).focus());
    await user.keyboard(" ");
    await settle();

    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(" ");
  });

  it("skips with j and l, except while typing or with a modifier", async () => {
    const { audio, user } = renderWithShortcuts();

    await user.keyboard("llj");
    await user.keyboard("{Meta>}l{/Meta}");
    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(10);

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    await user.keyboard("l");
    fire(audio, "loadedmetadata");
    expect(audio.currentTime).toBe(10);
  });
});
