import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAudioUrl } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { PlayerBar } from "./PlayerBar";
import { PlayerProvider } from "./PlayerProvider";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

const mockedAudioUrl = vi.mocked(getAudioUrl);
const { summary } = meetingFixture();

function renderBar() {
  render(
    <PlayerProvider meetingId="abc" durationSeconds={105}>
      <PlayerBar
        sections={summary?.notes ?? []}
        actionItems={summary?.actionItems ?? []}
      />
    </PlayerProvider>,
  );
  const audio = document.querySelector("audio") as HTMLAudioElement;
  const fire = (type: string) =>
    act(() => {
      audio.dispatchEvent(new Event(type));
    });
  return { user: userEvent.setup(), audio, fire };
}

const bar = () => within(screen.getByRole("region", { name: "Audio player" }));
const button = (name: string) => screen.getByRole("button", { name });
const settle = () => act(() => Promise.resolve());

beforeEach(() => {
  mockedAudioUrl.mockReset().mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("PlayerBar", () => {
  it("plays with a loading spinner, then pauses", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, fire } = renderBar();
    expect(bar().getByText("0:00")).toBeVisible();
    expect(bar().getByText("1:45")).toBeVisible();
    expect(bar().getByRole("status")).toBeEmptyDOMElement();

    await user.click(button("Play"));
    const spinner = () =>
      button("Pause").querySelector("[data-slot='spinner']");
    expect(spinner()).not.toBeNull();
    await settle();
    expect(play).toHaveBeenCalledTimes(1);

    fire("play");
    fire("playing");
    expect(spinner()).toBeNull();

    await user.click(button("Pause"));
    expect(pause).toHaveBeenCalledTimes(1);
    fire("pause");
    expect(button("Play")).toBeVisible();
  });

  it("skips back and forward and shows the new time", async () => {
    const { user } = renderBar();

    await user.click(button("Forward 10 seconds"));
    await user.click(button("Forward 10 seconds"));
    await user.click(button("Back 10 seconds"));

    expect(bar().getByText("0:10")).toBeVisible();
    expect(button("Back 10 seconds")).not.toHaveFocus();
  });

  it("shows the dragged time while scrubbing", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 210, height: 32 }),
    );
    renderBar();
    const track = document.querySelector("[data-slot='track']") as HTMLElement;

    fireEvent.pointerDown(track, { pointerId: 1, clientX: 104 });

    expect(bar().getByText("0:52")).toBeVisible();
  });

  it("changes the playback speed", async () => {
    const { user, audio } = renderBar();

    await user.click(button("Playback speed: 1×"));
    const options = await screen.findAllByRole("menuitemradio");
    expect(options.map((option) => option.textContent)).toEqual([
      "0.75×",
      "1×",
      "1.25×",
      "1.5×",
      "2×",
    ]);
    await user.click(screen.getByRole("menuitemradio", { name: "1.5×" }));

    expect(audio.playbackRate).toBe(1.5);
    expect(button("Playback speed: 1.5×")).toBeVisible();
  });

  it("says when the audio is unavailable", async () => {
    mockedAudioUrl.mockRejectedValue(new Error("missing"));
    const { user } = renderBar();

    await user.click(button("Play"));
    await settle();

    expect(bar().getByRole("status")).toHaveTextContent("Audio unavailable");
    expect(
      bar()
        .getAllByText("Audio unavailable")
        .map((el) => el.getAttribute("aria-hidden")),
    ).toEqual(["true", null]);
    expect(button("Play")).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
