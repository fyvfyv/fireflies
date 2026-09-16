import type { Segment } from "@shared/schemas";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { PlayerProvider } from "@/features/player/PlayerProvider";
import { TimestampMark } from "@/features/player/TimestampMark";
import { getAudioUrl } from "@/lib/api";
import { TranscriptPanel } from "./TranscriptPanel";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

const segments: Segment[] = [
  { text: " The release is on Friday.", startSecond: 0, endSecond: 3 },
  { text: " Release notes come first.", startSecond: 3, endSecond: 6 },
  { text: " Pricing is next.", startSecond: 40, endSecond: 44 },
  { text: " We keep the release price.", startSecond: 70, endSecond: 75 },
];
const text = segments.map((s) => s.text.trim()).join(" ");

type PanelProps = Partial<ComponentProps<typeof TranscriptPanel>>;

function tree(props: PanelProps = {}, extra?: ReactNode) {
  return (
    <PlayerProvider meetingId="abc" durationSeconds={80}>
      <TranscriptPanel text={text} segments={segments} {...props} />
      {extra}
      <Toaster />
    </PlayerProvider>
  );
}

function renderPanel(props: PanelProps = {}, extra?: ReactNode) {
  const user = userEvent.setup();
  const result = render(tree(props, extra));
  const audio = document.querySelector("audio") as HTMLAudioElement;
  const playAt = (seconds: number) =>
    act(() => {
      audio.currentTime = seconds;
      audio.dispatchEvent(new Event("play"));
      audio.dispatchEvent(new Event("timeupdate"));
    });
  const pause = () =>
    act(() => {
      audio.dispatchEvent(new Event("pause"));
    });
  return { ...result, user, audio, playAt, pause };
}

const panel = () => within(screen.getByRole("region", { name: "Transcript" }));
const search = () =>
  screen.getByRole("searchbox", { name: "Search transcript" });
const paragraph = (index: number) =>
  document.querySelector<HTMLElement>(`[data-paragraph="${index}"]`);

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("TranscriptPanel", () => {
  it("groups segments into timed paragraphs", () => {
    renderPanel();

    expect(
      panel()
        .getAllByRole("button", { name: /^Play from/ })
        .map((b) => b.textContent),
    ).toEqual(["0:00", "0:40", "1:10"]);
    expect(paragraph(0)).toHaveTextContent(
      "0:00The release is on Friday. Release notes come first.",
    );
  });

  it("widens every time column for recordings past an hour", () => {
    renderPanel({
      segments: [
        { text: "Welcome.", startSecond: 0, endSecond: 2 },
        { text: "Still here.", startSecond: 3700, endSecond: 3702 },
      ],
      text: "Welcome. Still here.",
    });

    expect(
      screen.getByRole("button", { name: "Play from 1:01:40" }),
    ).toHaveTextContent(/^1:01:40$/);
    expect(paragraph(0)?.className).toContain("grid-cols-[3.5rem");
  });

  it("plays from a paragraph's timestamp", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const { user, audio } = renderPanel();

    const time = screen.getByRole("button", { name: "Play from 0:40" });
    await user.click(time);
    await act(() => Promise.resolve());
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(40);
    expect(time).not.toHaveFocus();
  });

  it("lights the segment under the playhead", () => {
    const { playAt } = renderPanel();
    const lit = () =>
      [...document.querySelectorAll("[data-active]")].map(
        (el) => el.textContent,
      );
    expect(lit()).toEqual([]);

    playAt(4);
    expect(lit()).toEqual(["Release notes come first."]);

    playAt(71);
    expect(lit()).toEqual(["We keep the release price."]);
  });

  it("copies the transcript with timestamps", async () => {
    const { user } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Copy transcript" }));

    expect(await screen.findByText("Transcript copied")).toBeVisible();
    await expect(navigator.clipboard.readText()).resolves.toBe(
      [
        "[00:00] The release is on Friday. Release notes come first.",
        "[00:40] Pricing is next.",
        "[01:10] We keep the release price.",
      ].join("\n\n"),
    );
  });

  describe("opening", () => {
    const view = (open: boolean) => (
      <PlayerProvider meetingId="abc" durationSeconds={80}>
        {open && <TranscriptPanel text={text} segments={segments} />}
        <TimestampMark seconds={72} />
      </PlayerProvider>
    );

    // Paragraph n sits 500 px × n down the page; the window shows 0–768 px.
    function layOutPage() {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          const index = Number(this.getAttribute("data-paragraph") ?? 0);
          return DOMRect.fromRect({ x: 0, y: index * 500, height: 80 });
        },
      );
      return vi.spyOn(Element.prototype, "scrollIntoView");
    }

    it("shows a moment picked while the transcript was closed", async () => {
      const user = userEvent.setup();
      const { rerender } = render(view(false));
      await user.click(screen.getByRole("button", { name: "Play from 1:12" }));
      const scroll = layOutPage();

      rerender(view(true));

      expect(scroll.mock.contexts).toEqual([paragraph(2)]);
    });

    it("shows where paused playback stopped", () => {
      const { rerender } = render(view(false));
      const audio = document.querySelector("audio") as HTMLAudioElement;
      act(() => {
        audio.currentTime = 71;
        audio.dispatchEvent(new Event("timeupdate"));
      });
      const scroll = layOutPage();

      rerender(view(true));

      expect(scroll.mock.contexts).toEqual([paragraph(2)]);
    });

    it("stays at the top before anything played", () => {
      const { rerender } = render(view(false));
      const scroll = layOutPage();

      rerender(view(true));

      expect(scroll).not.toHaveBeenCalled();
    });
  });

  describe("search", () => {
    it("counts, highlights and steps through matches", async () => {
      const { user } = renderPanel();
      const counter = () => panel().getByRole("status");
      const current = () => document.querySelector("mark[data-current]");

      await user.type(search(), "release");

      expect(counter()).toHaveTextContent("1 of 3");
      expect(document.querySelectorAll("mark")).toHaveLength(3);
      expect(current()).toHaveTextContent("release");

      await user.keyboard("{Enter}");
      expect(counter()).toHaveTextContent("2 of 3");
      expect(current()).toHaveTextContent("Release");

      await user.click(screen.getByRole("button", { name: "Next match" }));
      expect(current()?.closest("[data-paragraph]")).toBe(paragraph(2));

      await user.click(screen.getByRole("button", { name: "Next match" }));
      expect(counter()).toHaveTextContent("1 of 3");
      search().focus();
      await user.keyboard("{Shift>}{Enter}{/Shift}");
      expect(counter()).toHaveTextContent("3 of 3");
      await user.click(screen.getByRole("button", { name: "Previous match" }));
      expect(counter()).toHaveTextContent("2 of 3");

      await user.type(search(), "{Escape}");
      expect(search()).toHaveValue("");
      expect(document.querySelectorAll("mark")).toHaveLength(0);
      expect(counter()).toBeEmptyDOMElement();
      expect(
        screen.queryByRole("button", { name: "Next match" }),
      ).not.toBeInTheDocument();
    });

    it("says when nothing matches", async () => {
      const { user } = renderPanel();

      await user.type(search(), "budget");

      expect(panel().getByRole("status")).toHaveTextContent("No matches");
      expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Previous match" }),
      ).toBeDisabled();
    });

    it("scrolls to the current match, but not again for a refetched transcript", async () => {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { user, rerender } = renderPanel();

      await user.type(search(), "release");
      await user.keyboard("{Enter}");
      expect(scroll.mock.contexts.at(-1)).toBe(
        document.querySelector("mark[data-current]"),
      );
      const calls = scroll.mock.calls.length;

      rerender(tree({ segments: structuredClone(segments) }));

      expect(scroll).toHaveBeenCalledTimes(calls);
      expect(panel().getByRole("status")).toHaveTextContent("2 of 3");
    });
  });

  describe("states", () => {
    it("shows a placeholder while transcribing", () => {
      const { rerender } = renderPanel({ text: null, segments: null });

      expect(panel().queryByRole("status")).not.toBeInTheDocument();
      expect(
        panel().getByText(
          "The transcript appears here once the recording is transcribed.",
        ),
      ).toBeVisible();
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Copy transcript" }),
      ).not.toBeInTheDocument();

      rerender(tree({ text: null, segments: null, layout: "rail" }));
      expect(
        screen.getByRole("button", { name: "Copy transcript" }),
      ).toBeDisabled();
    });

    it.each<[PanelProps, string]>([
      [
        { text: null, segments: null, transcribing: false },
        "There's no transcript yet.",
      ],
      [{ text: "  ", segments: [] }, "No speech was detected."],
    ])("explains an empty transcript %#", (props, message) => {
      renderPanel(props);

      expect(panel().getByText(message)).toBeVisible();
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("shows searchable plain paragraphs without segments", async () => {
      const { user } = renderPanel({
        text: "Hello team.\nLet's start.",
        segments: null,
      });

      expect(paragraph(1)).toHaveTextContent("Let's start.");
      expect(
        screen.queryByRole("button", { name: /^Play from/ }),
      ).not.toBeInTheDocument();

      await user.type(search(), "start");
      expect(document.querySelector("mark")).toHaveTextContent("start");
    });
  });

  describe("follow playback", () => {
    let now = 100_000;
    let offset = 0;
    let scrollTo: Mock;

    const scroller = () =>
      document.querySelector("[data-slot='transcript-scroll']") as HTMLElement;

    function renderRail(
      { height = 400, barTop }: { height?: number; barTop?: number } = {},
      extra?: ReactNode,
    ) {
      const result = renderPanel({ layout: "rail" }, extra);
      const rail = scroller();
      offset = 0;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      scrollTo = vi.fn();
      rail.scrollTo = scrollTo;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          if (this === rail) return DOMRect.fromRect({ height });
          if (this.hasAttribute("data-player-bar") && barTop !== undefined) {
            return DOMRect.fromRect({ y: barTop, height: 64 });
          }
          const index = Number(this.getAttribute("data-paragraph") ?? 0);
          return DOMRect.fromRect({ y: index * 500 - offset, height: 100 });
        },
      );
      const readerScrolls = () => fireEvent.wheel(rail);
      const wait = async (ms: number) => {
        now += ms;
        await act(() => vi.advanceTimersByTimeAsync(ms));
      };
      return { ...result, readerScrolls, wait };
    }

    it.each([
      [false, "smooth"],
      [true, "auto"],
    ])(
      "keeps the spoken paragraph in view (reduced motion: %s)",
      (reduced, behavior) => {
        vi.spyOn(window, "matchMedia").mockImplementation(
          (media) =>
            ({
              matches: reduced && media === "(prefers-reduced-motion: reduce)",
              addEventListener: () => {},
              removeEventListener: () => {},
            }) as unknown as MediaQueryList,
        );
        const { playAt } = renderRail();

        playAt(1);
        expect(scrollTo).not.toHaveBeenCalled();

        playAt(41);
        expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
          top: 350,
          behavior,
        });
      },
    );

    it("counts the rail behind the player bar as out of view", () => {
      const { playAt } = renderRail(
        { height: 1000, barTop: 550 },
        <div data-player-bar="" />,
      );

      playAt(41);

      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("returns 4 s after the reader last scrolled away", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { playAt, readerScrolls, wait } = renderRail();
      playAt(1);

      readerScrolls();
      offset = 600;
      await wait(1_000);
      readerScrolls();
      await wait(3_900);
      expect(scrollTo).not.toHaveBeenCalled();

      await wait(100);
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("stays put when playback pauses during the grace", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { playAt, pause, readerScrolls, wait } = renderRail();

      readerScrolls();
      playAt(41);
      pause();
      await wait(5_000);

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("offers a way back while playing, and follows again after the grace", async () => {
      const { playAt, pause, readerScrolls, user } = renderRail();

      readerScrolls();
      now += 3_000;
      playAt(41);
      expect(scrollTo).not.toHaveBeenCalled();
      pause();
      expect(
        screen.queryByRole("button", { name: "Jump to current" }),
      ).not.toBeInTheDocument();

      playAt(41);
      await user.click(screen.getByRole("button", { name: "Jump to current" }));
      expect(scrollTo).toHaveBeenCalledTimes(1);

      readerScrolls();
      now += 4_001;
      playAt(71);
      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it("counts text under the sticky search row as hidden in the tab", () => {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { playAt } = renderPanel({ layout: "page" });
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          if (this.hasAttribute("data-transcript-search")) {
            return DOMRect.fromRect({ y: 40, height: 60 });
          }
          const index = Number(this.getAttribute("data-paragraph") ?? 0);
          return DOMRect.fromRect({ y: index === 1 ? 50 : -500, height: 100 });
        },
      );

      playAt(41);

      expect(scroll.mock.contexts).toEqual([paragraph(1)]);
    });

    it("holds the view on search results until the query is cleared", async () => {
      const { playAt, user } = renderRail();

      await user.type(search(), "budget");
      playAt(41);
      expect(scrollTo).toHaveBeenCalledTimes(1);

      await user.clear(search());
      await user.type(search(), "release");
      now += 5_000;
      playAt(71);
      expect(scrollTo).toHaveBeenCalledTimes(1);

      await user.clear(search());
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ top: 850 }),
      );
    });

    it("moves to a moment picked elsewhere, even while paused", async () => {
      const { user, readerScrolls } = renderRail(
        {},
        <TimestampMark seconds={72} />,
      );
      readerScrolls();

      await user.click(screen.getByRole("button", { name: "Play from 1:12" }));

      expect(scrollTo).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ top: 850 }),
      );
    });
  });
});
