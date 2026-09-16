import type { Meeting } from "@shared/schemas";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { ApiError, regenerateNotes } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { LegacyNotesPrompt } from "./LegacyNotesPrompt";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  regenerateNotes: vi.fn(),
}));

const mockedRegenerate = vi.mocked(regenerateNotes);

const refuse = (status: number, message: string) =>
  mockedRegenerate.mockRejectedValue(
    new ApiError({ status, code: "x", message, retryable: false }),
  );
const idleButton = () =>
  screen.getByRole("button", { name: "Generate detailed notes" });

async function renderAndGenerate() {
  const onUpdated = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <>
      <LegacyNotesPrompt
        meetingId="abc"
        onUpdated={onUpdated}
        onBusyChange={onBusyChange}
      />
      <Toaster />
    </>,
  );
  expect(
    screen.getByText(
      "This meeting has a short summary. Generate detailed notes with timestamps.",
    ),
  ).toBeVisible();
  await userEvent.setup().click(idleButton());
  return { onUpdated, onBusyChange };
}

describe("LegacyNotesPrompt", () => {
  it("generates detailed notes, then asks for the updated meeting", async () => {
    let finish: (meeting: Meeting) => void = () => {};
    mockedRegenerate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onUpdated, onBusyChange } = await renderAndGenerate();

    expect(mockedRegenerate).toHaveBeenCalledWith("abc");
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole("button", { name: "Generating notes…" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(onUpdated).not.toHaveBeenCalled();

    await act(async () => finish(meetingFixture()));

    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("shows a refused request and refetches", async () => {
    refuse(422, "These notes are already up to date.");
    const { onUpdated } = await renderAndGenerate();

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText("These notes are already up to date."),
    ).toBeInTheDocument();
    expect(idleButton()).not.toHaveAttribute("aria-busy");
  });

  it("stays quiet when another tab already started the run", async () => {
    refuse(409, "Meeting is already being processed");
    const { onUpdated } = await renderAndGenerate();

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("Meeting is already being processed"),
    ).not.toBeInTheDocument();
    expect(idleButton()).not.toHaveAttribute("aria-busy");
  });
});
