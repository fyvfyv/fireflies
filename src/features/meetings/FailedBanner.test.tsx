import { MAX_ATTEMPTS } from "@shared/constants";
import type { Meeting } from "@shared/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { meetingFixture } from "@/test/fixtures";
import { FailedBanner } from "./FailedBanner";

const failed = (overrides: Partial<Meeting> = {}) =>
  meetingFixture({
    status: "failed",
    summary: null,
    errorStep: "transcribe",
    errorMessage: "Speech-to-text provider is unavailable",
    errorRetryable: true,
    attempts: 1,
    ...overrides,
  });

function renderBanner(props: Partial<ComponentProps<typeof FailedBanner>>) {
  const onRetry = vi.fn();
  const onDelete = vi.fn();
  render(
    <FailedBanner
      meeting={failed()}
      onRetry={onRetry}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onRetry, onDelete, user: userEvent.setup() };
}

describe("FailedBanner", () => {
  it("is a labelled region", () => {
    renderBanner({});

    expect(
      screen.getByRole("region", { name: "Couldn't transcribe the recording" }),
    ).toBeVisible();
  });

  it("shows why a delete failed", async () => {
    const { user } = renderBanner({
      meeting: failed({ errorRetryable: false }),
      deleteError: "Database unavailable",
    });

    await user.click(
      screen.getByRole("button", { name: "Delete and re-upload" }),
    );

    expect(
      within(screen.getByRole("dialog")).getByRole("alert"),
    ).toHaveTextContent("Database unavailable");
  });

  it("explains a failed transcription and offers a retry", async () => {
    const { onRetry, user } = renderBanner({});

    expect(screen.getByText("Couldn't transcribe the recording")).toBeVisible();
    expect(
      screen.getByText("Speech-to-text provider is unavailable"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete and re-upload" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("tells the user a summary retry keeps the transcript", () => {
    renderBanner({ meeting: failed({ errorStep: "summarize" }) });

    expect(screen.getByText("Couldn't write the notes")).toBeVisible();
    expect(screen.getByText(/transcript is saved/i)).toBeVisible();
  });

  it("offers a retry for an interrupted run", () => {
    renderBanner({
      meeting: meetingFixture({
        status: "transcribing",
        summary: null,
        stalled: true,
      }),
    });

    expect(screen.getByText("Processing was interrupted")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("offers only deletion when the error is permanent", async () => {
    const { onDelete, user } = renderBanner({
      meeting: failed({ errorRetryable: false }),
    });

    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Delete and re-upload" }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("stops offering retries after too many attempts", () => {
    renderBanner({ meeting: failed({ attempts: MAX_ATTEMPTS }) });

    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/failed 5 times/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete and re-upload" }),
    ).toBeVisible();
  });

  it("locks the retry while it runs and shows its error", async () => {
    const { onRetry, user } = renderBanner({
      retrying: true,
      retryError: "Can't reach the server.",
    });

    const button = screen.getByRole("button", { name: "Retrying…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Can't reach the server.",
    );
  });
});
