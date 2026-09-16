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

function renderMark() {
  render(
    <PlayerProvider meetingId="abc" durationSeconds={125}>
      <TimestampMark seconds={70.4} />
      <Position />
    </PlayerProvider>,
  );
  return {
    user: userEvent.setup(),
    mark: screen.getByRole("button", { name: "Play from 1:10" }),
  };
}

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

describe("TimestampMark", () => {
  it("plays the recording from its moment and replays the sweep", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const { user, mark } = renderMark();
    const stroke = () => mark.querySelector("[data-slot='stroke']");
    expect(mark).toHaveTextContent(/^1:10$/);

    await user.click(mark);
    await act(() => Promise.resolve());

    expect(screen.getByRole("status", { name: "Position" })).toHaveTextContent(
      "70.4",
    );
    expect(play).toHaveBeenCalledTimes(1);
    const first = stroke();
    expect(first).toHaveClass("animate-marker-sweep");

    await user.click(mark);
    expect(stroke()).not.toBe(first);
  });

  it("lets Space pause after a click instead of seeking again", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const { user, mark } = renderMark();

    await user.click(mark);
    await act(() => Promise.resolve());
    act(() => {
      document.querySelector("audio")?.dispatchEvent(new Event("play"));
    });
    expect(mark).not.toHaveFocus();

    await user.keyboard(" ");

    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps focus when activated from the keyboard", async () => {
    const { user, mark } = renderMark();

    act(() => mark.focus());
    await user.keyboard("{Enter}");

    expect(mark).toHaveFocus();
  });
});
