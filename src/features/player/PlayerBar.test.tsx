import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToastState } from "@/components/ui/toastStore";
import { getAudioUrl } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { PlayerBar } from "./PlayerBar";
import { PlayerProvider } from "./PlayerProvider";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

const mockedAudioUrl = vi.mocked(getAudioUrl);
const meeting = meetingFixture();

function renderBar() {
  const user = userEvent.setup();
  render(
    <PlayerProvider meetingId="abc" durationSeconds={105}>
      <PlayerBar
        sections={meeting.summary?.notes ?? []}
        actionItems={meeting.summary?.actionItems ?? []}
      />
    </PlayerProvider>,
  );
  const audio = document.querySelector("audio") as HTMLAudioElement;
  const fire = (type: string) =>
    act(() => {
      audio.dispatchEvent(new Event(type));
    });
  return { user, audio, fire };
}

const bar = () => screen.getByRole("region", { name: "Audio player" });
const settle = () => act(() => Promise.resolve());

beforeEach(() => {
  mockedAudioUrl.mockReset().mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("PlayerBar", () => {
  it("shows the controls, the time and the tape", () => {
    renderBar();

    const region = within(bar());
    expect(region.getByRole("button", { name: "Play" })).toBeEnabled();
    expect(
      region.getByRole("button", { name: "Back 10 seconds" }),
    ).toBeVisible();
    expect(
      region.getByRole("button", { name: "Forward 10 seconds" }),
    ).toBeVisible();
    expect(region.getByText("0:00")).toBeVisible();
    expect(region.getByText("1:45")).toBeVisible();
    // The ticking time sits in fixed digit cells; the duration doesn't tick.
    expect(bar().querySelectorAll("[data-slot='digit']")).toHaveLength(3);
    // Sized for the duration, so the tape never shifts as the time grows.
    const slot = region.getByText("0:00").parentElement?.parentElement;
    expect(slot?.style.minWidth).toBe("4ch");
    expect(region.getByRole("slider", { name: "Seek" })).toBeVisible();
    expect(
      region.getByRole("button", { name: "Playback speed: 1×" }),
    ).toBeVisible();
  });

  it("draws the skip icons at player size, without a tiny numeral", () => {
    renderBar();

    for (const name of ["Back 10 seconds", "Forward 10 seconds"]) {
      const button = screen.getByRole("button", { name });
      const icon = button.querySelector("svg");
      expect(icon).toHaveAttribute("width", "20");
      expect(icon).toHaveAttribute("stroke-width", "1.75");
      expect(button).toHaveTextContent(/^$/);
    }
  });

  it("plays, shows loading, and pauses", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, fire } = renderBar();

    await user.click(screen.getByRole("button", { name: "Play" }));
    // Waiting for audio: a spinner, and the button can cancel.
    const loading = screen.getByRole("button", { name: "Pause" });
    expect(loading.querySelector("[data-slot='spinner']")).not.toBeNull();
    await settle();
    expect(play).toHaveBeenCalledTimes(1);

    fire("play");
    fire("playing");
    const pauseButton = screen.getByRole("button", { name: "Pause" });
    expect(pauseButton.querySelector("[data-slot='spinner']")).toBeNull();

    await user.click(pauseButton);
    expect(pause).toHaveBeenCalledTimes(1);
    fire("pause");
    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
  });

  it("skips back and forward and shows the new time", async () => {
    const { user } = renderBar();

    await user.click(
      screen.getByRole("button", { name: "Forward 10 seconds" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Forward 10 seconds" }),
    );
    const back = screen.getByRole("button", { name: "Back 10 seconds" });
    await user.click(back);

    expect(within(bar()).getByText("0:10")).toBeVisible();
    // Space should reach the play shortcut, not repeat the skip.
    expect(back).not.toHaveFocus();
  });

  it("shows the dragged time while scrubbing", () => {
    const captured = new Set<number>();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
      (id) => {
        captured.add(id);
      },
    );
    vi.spyOn(Element.prototype, "hasPointerCapture").mockImplementation((id) =>
      captured.has(id),
    );
    vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(
      (id) => {
        captured.delete(id);
      },
    );
    // The tape spans 0–210 px, so x px is x/2 seconds into 1:45.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 210, height: 32 }),
    );
    const { audio, fire } = renderBar();
    const track = bar().querySelector("[data-slot='track']") as HTMLElement;
    const pointer = { pointerId: 1, pointerType: "mouse", clientX: 104 };

    fireEvent.pointerDown(track, pointer);
    expect(within(bar()).getByText("0:52")).toBeVisible();
    fire("loadedmetadata");
    expect(audio.currentTime).toBe(0);

    fireEvent.pointerUp(track, pointer);
    expect(within(bar()).getByText("0:52")).toBeVisible();
    fire("loadedmetadata");
    expect(audio.currentTime).toBe(52);
  });

  it("changes the playback speed", async () => {
    const { user, audio } = renderBar();

    await user.click(
      screen.getByRole("button", { name: "Playback speed: 1×" }),
    );
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
    expect(
      screen.getByRole("button", { name: "Playback speed: 1.5×" }),
    ).toBeVisible();
  });

  it("says when the audio is unavailable", async () => {
    mockedAudioUrl.mockRejectedValue(new Error("missing"));
    const { user } = renderBar();

    await user.click(screen.getByRole("button", { name: "Play" }));
    await settle();

    expect(within(bar()).getByRole("status")).toHaveTextContent(
      "Audio unavailable",
    );
    // Shown once more for sighted users, without a second announcement.
    const shown = within(bar())
      .getAllByText("Audio unavailable")
      .filter((element) => element.getAttribute("aria-hidden") === "true");
    expect(shown).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Seek" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps an empty status mounted while the audio works", () => {
    renderBar();

    expect(within(bar()).getByRole("status")).toBeEmptyDOMElement();
  });

  it("lifts toasts above itself while mounted", () => {
    const { unmount } = render(
      <PlayerProvider meetingId="abc" durationSeconds={105}>
        <PlayerBar sections={[]} actionItems={[]} />
      </PlayerProvider>,
    );

    expect(getToastState().offset).toBeGreaterThan(0);
    unmount();
    expect(getToastState().offset).toBeNull();
  });
});
