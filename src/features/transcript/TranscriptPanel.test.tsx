import type { Segment } from "@shared/schemas";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

type PanelProps = Partial<Parameters<typeof TranscriptPanel>[0]>;

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
  return { ...result, user, audio, playAt };
}

const panel = () => screen.getByRole("region", { name: "Transcript" });
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

    const region = within(panel());
    expect(
      region
        .getAllByRole("button", { name: /^Play from/ })
        .map((b) => b.textContent),
    ).toEqual(["0:00", "0:40", "1:10"]);
    expect(paragraph(0)).toHaveTextContent(
      "0:00The release is on Friday. Release notes come first.",
    );
    expect(paragraph(0)).toHaveClass("grid-cols-[2.75rem_minmax(0,1fr)]");
  });

  it("widens the time column for recordings past an hour", () => {
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
    expect(paragraph(1)?.className).toContain("grid-cols-[3.5rem");
  });

  it("labels the tab's transcript without repeating its title", () => {
    renderPanel();

    const heading = within(panel()).getByRole("heading", {
      name: "Transcript",
    });
    expect(heading).toHaveClass("sr-only");
    const searchRow = document.querySelector("[data-transcript-search]");
    expect(searchRow).toContainElement(
      screen.getByRole("button", { name: "Copy transcript" }),
    );
    // Sticks under the tab row while the transcript scrolls by.
    expect(searchRow).toHaveClass("sticky");
  });

  it("shows a titled header in the rail", () => {
    renderPanel({ layout: "rail" });

    const heading = within(panel()).getByRole("heading", {
      name: "Transcript",
    });
    expect(heading).not.toHaveClass("sr-only");
    const searchRow = document.querySelector("[data-transcript-search]");
    const copy = screen.getByRole("button", { name: "Copy transcript" });
    expect(searchRow).not.toContainElement(copy);
    expect(searchRow).not.toHaveClass("sticky");
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
    // Space should reach the play shortcut, not seek here again.
    expect(time).not.toHaveFocus();
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
          return DOMRect.fromRect({
            x: 0,
            y: index * 500,
            width: 300,
            height: 80,
          });
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

  describe("search", () => {
    it("counts, highlights and steps through matches", async () => {
      const { user } = renderPanel();
      const counter = () => within(panel()).queryByRole("status");
      const current = () => document.querySelector("mark[data-current]");

      await user.type(search(), "release");

      expect(counter()).toHaveTextContent("1 of 3");
      expect(document.querySelectorAll("mark")).toHaveLength(3);
      expect(current()).toHaveTextContent("release");
      expect(current()?.closest("[data-paragraph]")).toBe(paragraph(0));

      await user.keyboard("{Enter}");
      expect(counter()).toHaveTextContent("2 of 3");
      expect(current()).toHaveTextContent("Release");

      await user.click(screen.getByRole("button", { name: "Next match" }));
      expect(counter()).toHaveTextContent("3 of 3");
      expect(current()?.closest("[data-paragraph]")).toBe(paragraph(2));

      // Wraps around in both directions.
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
      // The live region stays mounted so the next count is announced.
      expect(counter()).toBeEmptyDOMElement();
      expect(
        screen.queryByRole("button", { name: "Next match" }),
      ).not.toBeInTheDocument();
    });

    it("scrolls the current match into view", async () => {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { user } = renderPanel();

      await user.type(search(), "pricing");

      const mark = document.querySelector("mark[data-current]");
      expect(scroll.mock.contexts).toContain(mark);
    });

    it("stays on the current match when the same transcript arrives again", async () => {
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { user, rerender } = renderPanel();
      await user.type(search(), "release");
      await user.keyboard("{Enter}");
      const calls = scroll.mock.calls.length;
      expect(calls).toBeGreaterThan(0);

      // A poll or focus refetch returns equal data in new objects.
      rerender(tree({ segments: structuredClone(segments) }));

      expect(scroll).toHaveBeenCalledTimes(calls);
      expect(within(panel()).getByRole("status")).toHaveTextContent("2 of 3");
    });

    it("keeps matches visible inside the spoken segment", async () => {
      const { user, playAt } = renderPanel();
      playAt(4);

      await user.type(search(), "release");

      const inside = document.querySelectorAll("[data-active] mark");
      expect(inside).toHaveLength(1);
      expect(inside[0]).toHaveClass("underline", "bg-transparent");
      const outside = document.querySelector("mark:not([data-active] mark)");
      expect(outside).not.toHaveClass("underline");
    });

    it("says when nothing matches", async () => {
      const { user } = renderPanel();

      await user.type(search(), "budget");

      expect(within(panel()).getByRole("status")).toHaveTextContent(
        "No matches",
      );
      expect(screen.getByRole("button", { name: "Next match" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Previous match" }),
      ).toBeDisabled();
    });
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

  describe("states", () => {
    it("shows a placeholder while transcribing", () => {
      renderPanel({ text: null, segments: null });

      // The processing steps already announce the progress.
      expect(within(panel()).queryByRole("status")).not.toBeInTheDocument();
      expect(panel()).toHaveTextContent(
        "The transcript appears here once the recording is transcribed.",
      );
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Copy transcript" }),
      ).not.toBeInTheDocument();
    });

    it("keeps a disabled copy button in the rail while transcribing", () => {
      renderPanel({ text: null, segments: null, layout: "rail" });

      expect(
        screen.getByRole("button", { name: "Copy transcript" }),
      ).toBeDisabled();
    });

    it("doesn't claim to transcribe when no run is going", () => {
      renderPanel({ text: null, segments: null, transcribing: false });

      expect(panel()).toHaveTextContent("There's no transcript yet.");
      expect(within(panel()).queryByRole("status")).not.toBeInTheDocument();
    });

    it("says when no speech was detected", () => {
      renderPanel({ text: "  ", segments: [] });

      expect(panel()).toHaveTextContent("No speech was detected.");
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it.each([
      ["no segments", null],
      ["an empty segment list", []],
    ])("shows plain paragraphs with %s", async (_, list) => {
      const { user } = renderPanel({
        text: "Hello team.\nLet's start.",
        segments: list,
      });

      expect(paragraph(0)).toHaveTextContent("Hello team.");
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
    // How far the reader has scrolled the rail, in px.
    let offset = 0;
    let scrollTo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      offset = 0;
    });

    // The rail shows 0–400 px (or `height`); paragraph n sits at
    // 500 px × n − offset.
    function layOut(
      container: HTMLElement,
      { height = 400, barTop }: { height?: number; barTop?: number } = {},
    ) {
      vi.spyOn(Date, "now").mockImplementation(() => now);
      scrollTo = vi.fn();
      Object.defineProperty(container, "scrollTo", {
        value: scrollTo,
        configurable: true,
      });
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          if (this === container) {
            return DOMRect.fromRect({ x: 0, y: 0, width: 300, height });
          }
          if (this.hasAttribute("data-player-bar") && barTop !== undefined) {
            return DOMRect.fromRect({
              x: 0,
              y: barTop,
              width: 300,
              height: 64,
            });
          }
          const index = this.getAttribute("data-paragraph");
          const top = Number(index ?? 0) * 500 - offset;
          return DOMRect.fromRect({ x: 0, y: top, width: 300, height: 100 });
        },
      );
    }

    const scroller = () =>
      document.querySelector<HTMLElement>("[data-slot='transcript-scroll']");

    it("keeps the spoken paragraph in view", () => {
      const { playAt } = renderPanel({ layout: "rail" });
      layOut(scroller() as HTMLElement);

      playAt(1);
      expect(scrollTo).not.toHaveBeenCalled();

      playAt(41);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]?.[0]).toEqual({
        top: 350,
        behavior: "smooth",
      });
    });

    it("jumps instead of gliding with reduced motion", () => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (media: string) =>
          ({
            matches: media === "(prefers-reduced-motion: reduce)",
            media,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
      const { playAt } = renderPanel({ layout: "rail" });
      layOut(scroller() as HTMLElement);

      playAt(41);

      expect(scrollTo).toHaveBeenCalledWith({ top: 350, behavior: "auto" });
    });

    it("counts the rail behind the player bar as out of view", () => {
      const { playAt } = renderPanel(
        { layout: "rail" },
        <div data-player-bar="" />,
      );
      // Paragraph 1 (500–600 px) is inside the rail but under the bar.
      layOut(scroller() as HTMLElement, { height: 1000, barTop: 550 });

      playAt(41);

      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("returns to the spoken paragraph once the reader stops scrolling", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { playAt } = renderPanel({ layout: "rail" });
      const container = scroller() as HTMLElement;
      layOut(container);
      const wait = async (ms: number) => {
        now += ms;
        await act(() => vi.advanceTimersByTimeAsync(ms));
      };

      fireEvent.wheel(container);
      now += 1_000;
      playAt(41);
      expect(scrollTo).not.toHaveBeenCalled();

      // Still reading: another scroll restarts the pause.
      await wait(1_000);
      fireEvent.wheel(container);
      await wait(2_000);
      expect(scrollTo).not.toHaveBeenCalled();

      await wait(2_000);
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]?.[0]).toMatchObject({ top: 350 });
    });

    it("returns 4 s after the reader scrolls away mid-paragraph", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { playAt } = renderPanel({ layout: "rail" });
      const container = scroller() as HTMLElement;
      layOut(container);
      const wait = async (ms: number) => {
        now += ms;
        await act(() => vi.advanceTimersByTimeAsync(ms));
      };
      playAt(1);
      expect(scrollTo).not.toHaveBeenCalled();

      // Paragraph 0 is still spoken when the reader scrolls it out of view.
      fireEvent.wheel(container);
      offset = 600;
      await wait(3_900);
      expect(scrollTo).not.toHaveBeenCalled();

      await wait(100);
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("stays put when playback pauses during the reader's pause", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { playAt, audio } = renderPanel({ layout: "rail" });
      const container = scroller() as HTMLElement;
      layOut(container);

      fireEvent.wheel(container);
      playAt(41);
      act(() => {
        audio.dispatchEvent(new Event("pause"));
      });
      now += 5_000;
      await act(() => vi.advanceTimersByTimeAsync(5_000));

      expect(scrollTo).not.toHaveBeenCalled();
    });

    it("waits 4 s after the reader scrolls, and offers a way back", async () => {
      const { playAt, user } = renderPanel({ layout: "rail" });
      const container = scroller() as HTMLElement;
      layOut(container);

      fireEvent.wheel(container);
      now += 3_000;
      playAt(41);
      expect(scrollTo).not.toHaveBeenCalled();

      const pill = screen.getByRole("button", { name: "Jump to current" });
      await user.click(pill);
      expect(scrollTo).toHaveBeenCalledTimes(1);

      fireEvent.wheel(container);
      now += 4_001;
      playAt(71);
      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it("hides the pill while paused", () => {
      const { playAt, audio } = renderPanel({ layout: "rail" });
      layOut(scroller() as HTMLElement);
      fireEvent.wheel(scroller() as HTMLElement);

      playAt(41);
      expect(
        screen.getByRole("button", { name: "Jump to current" }),
      ).toBeVisible();

      act(() => {
        audio.dispatchEvent(new Event("pause"));
      });
      expect(
        screen.queryByRole("button", { name: "Jump to current" }),
      ).not.toBeInTheDocument();
    });

    it("counts text under the sticky search row as hidden in the tab", () => {
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      const { playAt } = renderPanel({ layout: "page" });
      // The search row ends at 100 px; paragraph 1 starts above that.
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          if (this.hasAttribute("data-transcript-search")) {
            return DOMRect.fromRect({ x: 0, y: 40, width: 300, height: 60 });
          }
          const index = Number(this.getAttribute("data-paragraph") ?? 0);
          return DOMRect.fromRect({
            x: 0,
            y: index === 1 ? 50 : -500,
            width: 300,
            height: 100,
          });
        },
      );

      playAt(41);

      expect(scroll.mock.contexts).toEqual([paragraph(1)]);
    });

    it("holds the view on search results until the query is cleared", async () => {
      const { playAt, user } = renderPanel({ layout: "rail" });
      layOut(scroller() as HTMLElement);

      await user.type(search(), "release");
      now += 5_000;
      playAt(41);
      expect(scrollTo).not.toHaveBeenCalled();

      await user.clear(search());

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]?.[0]).toMatchObject({ top: 350 });
    });

    it("keeps following when a search finds nothing", async () => {
      const { playAt, user } = renderPanel({ layout: "rail" });
      layOut(scroller() as HTMLElement);

      await user.type(search(), "budget");
      playAt(41);

      expect(scrollTo).toHaveBeenCalledTimes(1);
    });

    it("moves to a moment picked elsewhere, even while paused", async () => {
      const { user } = renderPanel(
        { layout: "rail" },
        <TimestampMark seconds={72} />,
      );
      layOut(scroller() as HTMLElement);
      fireEvent.wheel(scroller() as HTMLElement);

      await user.click(screen.getByRole("button", { name: "Play from 1:12" }));

      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]?.[0]).toMatchObject({ top: 850 });
    });
  });
});
