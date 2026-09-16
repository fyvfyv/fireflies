import type { Meeting } from "@shared/schemas";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { ApiError, regenerateNotes } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { LegacyNotesPrompt } from "./LegacyNotesPrompt";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  regenerateNotes: vi.fn(),
}));

const mockedRegenerate = vi.mocked(regenerateNotes);

function renderPrompt() {
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
  return { onUpdated, onBusyChange, user: userEvent.setup() };
}

beforeEach(() => {
  mockedRegenerate.mockReset();
});

describe("LegacyNotesPrompt", () => {
  it("generates detailed notes, then asks for the updated meeting", async () => {
    let finish: (meeting: Meeting) => void = () => {};
    mockedRegenerate.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onUpdated, onBusyChange, user } = renderPrompt();
    expect(
      screen.getByText(
        "This meeting has a short summary. Generate detailed notes with timestamps.",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Generate detailed notes" }),
    );

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

  it("shows why notes weren't generated", async () => {
    mockedRegenerate.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "notes_current",
        message: "These notes are already up to date.",
        retryable: false,
      }),
    );
    const { onUpdated, user } = renderPrompt();

    await user.click(
      screen.getByRole("button", { name: "Generate detailed notes" }),
    );

    expect(
      await screen.findByText("These notes are already up to date."),
    ).toBeVisible();
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Generate detailed notes" }),
    ).not.toHaveAttribute("aria-busy");
  });

  it("stays quiet when another tab already started", async () => {
    mockedRegenerate.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "already_processing",
        message: "Meeting is already being processed",
        retryable: false,
      }),
    );
    const { onUpdated, user } = renderPrompt();

    await user.click(
      screen.getByRole("button", { name: "Generate detailed notes" }),
    );

    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Meeting is already being processed"),
    ).not.toBeInTheDocument();
  });
});
