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

const section = (heading: string, startSecond: number): NoteSection => ({
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
  const { currentTime } = usePlayer();
  return <output aria-label="Position">{currentTime}</output>;
}

function renderTape({
  duration = 100 as number | null,
  onScrub = vi.fn(),
} = {}) {
  render(
    <PlayerProvider meetingId="abc" durationSeconds={duration}>
      <TopicTape
        sections={sections}
        actionItems={actionItems}
        onScrub={onScrub}
      />
      <Position />
    </PlayerProvider>,
  );
  const audio = document.querySelector("audio") as HTMLAudioElement;
  const playTo = (seconds: number) =>
    act(() => {
      audio.currentTime = seconds;
      audio.dispatchEvent(new Event("timeupdate"));
    });
  return { audio, playTo, onScrub };
}

const slider = () => screen.getByRole("slider", { name: "Seek" });
const position = () => screen.getByRole("status", { name: "Position" });
const slots = (name: string) =>
  document.querySelectorAll<HTMLElement>(`[data-slot='${name}']`);

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("TopicTape", () => {
  it("is a seek slider that reads out time and topic", () => {
    const { playTo } = renderTape();

    expect(slider()).toHaveAttribute("aria-valuemax", "100");
    expect(slider()).toHaveAttribute(
      "aria-valuetext",
      "0:00 of 1:40, Upload flow",
    );

    playTo(52);
    expect(slider()).toHaveAttribute("aria-valuenow", "52");
    expect(slider()).toHaveAttribute(
      "aria-valuetext",
      "0:52 of 1:40, Retry path",
    );
  });

  it("draws a span per section and ticks for timed action items", () => {
    renderTape();

    const spans = slots("topic-span");
    expect(spans).toHaveLength(3);
    expect(spans[1]).toHaveStyle({ left: "40%" });
    expect(spans[1]?.style.width).toBe("calc(40% - 2px)");
    const ticks = slots("action-tick");
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toHaveStyle({ left: "51%" });
  });

  it("is disabled while the length is unknown", () => {
    renderTape({ duration: null });

    expect(slider()).toHaveAttribute("aria-disabled", "true");
  });

  it.each([
    ["{ArrowLeft}", 15],
    ["{PageUp}", 50],
    ["{PageDown}", 0],
    ["{Home}", 0],
    ["{End}", 100],
  ])("moves with %s", async (key, expected) => {
    const user = userEvent.setup();
    renderTape();
    act(() => slider().focus());
    await user.keyboard("{ArrowRight>4/}");
    expect(position()).toHaveTextContent(/^20$/);

    await user.keyboard(key);

    expect(position()).toHaveTextContent(new RegExp(`^${expected}$`));
    expect(slider()).toHaveAttribute("aria-valuenow", String(expected));
  });

  describe("with a pointer", () => {
    beforeEach(() => {
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
    });

    const track = () => slots("track")[0] as HTMLElement;
    const at = (clientX: number, pointerType = "mouse") => ({
      pointerId: 1,
      pointerType,
      clientX,
    });

    it("previews a drag and seeks when released", () => {
      const { audio, onScrub } = renderTape();

      fireEvent.pointerDown(track(), at(50));
      expect(onScrub).toHaveBeenLastCalledWith(25);
      fireEvent.pointerMove(track(), at(120));
      expect(onScrub).toHaveBeenLastCalledWith(60);
      expect(slider()).toHaveAttribute(
        "aria-valuetext",
        "1:00 of 1:40, Retry path",
      );
      expect(position()).toHaveTextContent(/^0$/);

      fireEvent.pointerUp(track(), at(120));

      expect(onScrub).toHaveBeenLastCalledWith(null);
      expect(position()).toHaveTextContent(/^60$/);
      act(() => {
        audio.dispatchEvent(new Event("loadedmetadata"));
      });
      expect(audio.currentTime).toBe(60);
    });

    it("drops the preview when a drag ends where it started", () => {
      const { playTo, onScrub } = renderTape();
      playTo(30);

      fireEvent.pointerDown(track(), at(100));
      fireEvent.pointerMove(track(), at(60));
      fireEvent.pointerUp(track(), at(60));

      expect(onScrub).toHaveBeenLastCalledWith(null);
      playTo(40);
      expect(slider()).toHaveAttribute("aria-valuenow", "40");
    });

    it("shows the time and topic under the mouse only", () => {
      renderTape();
      const root = track().parentElement as HTMLElement;
      const preview = () => slots("hover-preview")[0];

      fireEvent.pointerMove(root, at(104, "touch"));
      expect(preview()).toBeUndefined();

      fireEvent.pointerMove(root, at(104));
      expect(preview()).toHaveTextContent("Retry path0:52");
      expect(preview()).toHaveStyle({ left: "52%" });

      fireEvent.pointerLeave(root, at(104));
      expect(preview()).toBeUndefined();
    });
  });
});
