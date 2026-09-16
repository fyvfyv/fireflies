import type { ActionItem, NoteSection } from "@shared/schemas";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAudioUrl } from "@/lib/api";
import { PlayerProvider, usePlayer } from "./PlayerProvider";
import { TopicTape } from "./TopicTape";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

const section = (heading: string, startSecond: number | null): NoteSection => ({
  heading,
  gist: "",
  startSecond,
  points: [],
});

const sections = [
  section("Upload flow", 0),
  section("Retry path", 40),
  section("Demo date", 80),
];
const actionItems: ActionItem[] = [
  { task: "Write tests", owner: "Daniel", due: null, startSecond: 51 },
  { task: "Send invite", owner: null, due: null, startSecond: null },
];

function Position() {
  const { currentTime, playing } = usePlayer();
  return (
    <output aria-label="Position">
      {currentTime} {playing ? "playing" : "paused"}
    </output>
  );
}

function renderTape(
  props: Partial<Parameters<typeof TopicTape>[0]> = {},
  duration: number | null = 100,
) {
  const user = userEvent.setup();
  const result = render(
    <PlayerProvider meetingId="abc" durationSeconds={duration}>
      <TopicTape sections={sections} actionItems={actionItems} {...props} />
      <Position />
    </PlayerProvider>,
  );
  const audio = document.querySelector("audio") as HTMLAudioElement;
  return { ...result, user, audio };
}

const position = () => screen.getByRole("status", { name: "Position" });

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("TopicTape", () => {
  function renderScrubber(duration: number | null = 100) {
    return renderTape({}, duration);
  }

  it("is a seek slider that reads out time and topic", async () => {
    const { audio } = renderScrubber();
    const slider = screen.getByRole("slider", { name: "Seek" });

    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "0:00 of 1:40, Upload flow",
    );
    expect(slider).toHaveAttribute("aria-valuemax", "100");

    act(() => {
      audio.currentTime = 52;
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(slider).toHaveAttribute("aria-valuenow", "52");
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "0:52 of 1:40, Retry path",
    );
  });

  it("draws one colored span per section and ticks for action items", () => {
    const { container } = renderScrubber();

    const spans = container.querySelectorAll<HTMLElement>(
      "[data-slot='topic-span']",
    );
    expect(spans).toHaveLength(3);
    expect(spans[1]).toHaveStyle({ left: "40%" });
    expect(spans[1]?.style.width).toBe("calc(40% - 2px)");
    expect(spans[2]).toHaveClass("bg-topic-3");
    const ticks = container.querySelectorAll("[data-slot='action-tick']");
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toHaveStyle({ left: "51%" });
  });

  it("is a plain track without sections", () => {
    const { container } = renderTape({ sections: [] });

    expect(container.querySelector("[data-slot='track']")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='topic-span']")).toBeNull();
  });

  it.each([
    ["{ArrowRight}", 25],
    ["{ArrowUp}", 25],
    ["{ArrowLeft}", 15],
    ["{ArrowDown}", 15],
    ["{PageUp}", 50],
    ["{PageDown}", 0],
    ["{Home}", 0],
    ["{End}", 100],
  ])("moves with %s", async (key, expected) => {
    const { user } = renderScrubber();
    const slider = screen.getByRole("slider", { name: "Seek" });
    act(() => slider.focus());
    // Start from 0:20.
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(position()).toHaveTextContent("20");

    await user.keyboard(key);

    expect(position()).toHaveTextContent(new RegExp(`^${expected} `));
    expect(slider).toHaveAttribute("aria-valuenow", String(expected));
  });

  describe("with a pointer", () => {
    // The tape is 200 px wide at the left edge, so x px is x/2 % of the way.
    function layOutTape() {
      const captured = new Set<number>();
      vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
        (id) => {
          captured.add(id);
        },
      );
      vi.spyOn(Element.prototype, "hasPointerCapture").mockImplementation(
        (id) => captured.has(id),
      );
      vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(
        (id) => {
          captured.delete(id);
        },
      );
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 32 }),
      );
    }

    const track = () =>
      document.querySelector("[data-slot='track']") as HTMLElement;
    const at = (clientX: number, pointerType = "mouse") => ({
      pointerId: 1,
      pointerType,
      clientX,
    });

    it("previews a drag and seeks when released", () => {
      layOutTape();
      const onScrub = vi.fn();
      const { audio } = renderTape({ onScrub });
      const slider = screen.getByRole("slider", { name: "Seek" });

      fireEvent.pointerDown(track(), at(50));
      expect(onScrub).toHaveBeenLastCalledWith(25);
      fireEvent.pointerMove(track(), at(120));
      expect(onScrub).toHaveBeenLastCalledWith(60);
      expect(slider).toHaveAttribute("aria-valuenow", "60");
      expect(slider).toHaveAttribute(
        "aria-valuetext",
        "1:00 of 1:40, Retry path",
      );
      // Nothing is sought until the drag ends.
      expect(position()).toHaveTextContent(/^0 /);

      fireEvent.pointerUp(track(), at(120));

      expect(onScrub).toHaveBeenLastCalledWith(null);
      expect(position()).toHaveTextContent(/^60 /);
      act(() => {
        audio.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(audio.currentTime).toBe(60);
    });

    it("drops the preview when a drag ends where it started", () => {
      layOutTape();
      const onScrub = vi.fn();
      const { audio } = renderTape({ onScrub });
      const slider = screen.getByRole("slider", { name: "Seek" });
      const playTo = (seconds: number) =>
        act(() => {
          audio.currentTime = seconds;
          audio.dispatchEvent(new Event("timeupdate"));
        });
      playTo(30);

      fireEvent.pointerDown(track(), at(100));
      fireEvent.pointerMove(track(), at(60));
      fireEvent.pointerUp(track(), at(60));

      expect(onScrub).toHaveBeenLastCalledWith(null);
      playTo(40);
      expect(slider).toHaveAttribute("aria-valuenow", "40");
    });

    it("leaves Space to play and pause after a drag", async () => {
      layOutTape();
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      const { user } = renderTape();

      fireEvent.pointerDown(track(), at(50));
      fireEvent.pointerUp(track(), at(50));
      expect(screen.getByRole("slider", { name: "Seek" })).toHaveFocus();

      await user.keyboard(" ");
      await act(() => Promise.resolve());

      expect(play).toHaveBeenCalledTimes(1);
    });

    it("shows the time and topic under the mouse", () => {
      layOutTape();
      renderTape();
      const root = track().parentElement as HTMLElement;

      fireEvent.pointerMove(root, at(104));

      const preview = () => root.querySelector("[data-slot='hover-preview']");
      expect(preview()).toHaveTextContent("Retry path0:52");
      expect(preview()).toHaveStyle({ left: "52%" });

      fireEvent.pointerLeave(root, at(104));
      expect(preview()).toBeNull();
    });

    it("shows no hover preview for touch", () => {
      layOutTape();
      renderTape();
      const root = track().parentElement as HTMLElement;

      fireEvent.pointerMove(root, at(104, "touch"));

      expect(root.querySelector("[data-slot='hover-preview']")).toBeNull();
    });
  });

  it("is disabled while the length is unknown", () => {
    renderScrubber(null);

    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
