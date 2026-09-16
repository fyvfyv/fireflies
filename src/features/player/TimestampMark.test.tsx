import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAudioUrl } from "@/lib/api";
import { PlayerProvider, usePlayer } from "./PlayerProvider";
import { TimestampMark } from "./TimestampMark";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getAudioUrl: vi.fn(),
}));

function Position() {
  const { currentTime } = usePlayer();
  return <output aria-label="Position">{currentTime}</output>;
}

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("TimestampMark", () => {
  it("shows the moment and names what it does", () => {
    render(<TimestampMark seconds={70.4} />);

    const mark = screen.getByRole("button", { name: "Play from 1:10" });
    expect(mark).toHaveTextContent(/^1:10$/);
  });

  it("grows its target for touch without moving the text", () => {
    render(<TimestampMark seconds={5} />);

    const mark = screen.getByRole("button", { name: "Play from 0:05" });
    expect(mark).toHaveClass("relative", "pointer-coarse:before:-inset-y-2");
  });

  it("plays the recording from its moment and replays the sweep", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const onJump = vi.fn();
    const user = userEvent.setup();
    render(
      <PlayerProvider meetingId="abc" durationSeconds={125}>
        <TimestampMark seconds={70} onJump={onJump} />
        <Position />
      </PlayerProvider>,
    );
    const mark = screen.getByRole("button", { name: "Play from 1:10" });
    const stroke = () => mark.querySelector("[data-slot='stroke']");
    expect(stroke()).not.toHaveClass("animate-marker-sweep");

    await user.click(mark);
    await act(() => Promise.resolve());

    expect(screen.getByRole("status", { name: "Position" })).toHaveTextContent(
      "70",
    );
    expect(play).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(70);
    const first = stroke();
    expect(first).toHaveClass("animate-marker-sweep");

    await user.click(mark);
    // A fresh element restarts the animation.
    expect(stroke()).not.toBe(first);
    expect(stroke()).toHaveClass("animate-marker-sweep");
  });

  it("lets Space pause after a click instead of seeking again", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const user = userEvent.setup();
    render(
      <PlayerProvider meetingId="abc" durationSeconds={125}>
        <TimestampMark seconds={70} />
      </PlayerProvider>,
    );
    const audio = document.querySelector("audio") as HTMLAudioElement;

    await user.click(screen.getByRole("button", { name: "Play from 1:10" }));
    await act(() => Promise.resolve());
    act(() => {
      audio.dispatchEvent(new Event("play"));
    });
    expect(document.activeElement).toBe(document.body);

    await user.keyboard(" ");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps focus when activated from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider meetingId="abc" durationSeconds={125}>
        <TimestampMark seconds={70} />
      </PlayerProvider>,
    );
    const mark = screen.getByRole("button", { name: "Play from 1:10" });

    act(() => mark.focus());
    await user.keyboard("{Enter}");

    expect(mark).toHaveFocus();
  });

  it("still reports the jump without a player", async () => {
    const onJump = vi.fn();
    const user = userEvent.setup();
    render(<TimestampMark seconds={5} onJump={onJump} />);

    await user.click(screen.getByRole("button", { name: "Play from 0:05" }));

    expect(onJump).toHaveBeenCalledWith(5);
  });
});
