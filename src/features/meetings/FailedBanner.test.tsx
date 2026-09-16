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

const retryButton = () => screen.queryByRole("button", { name: "Retry" });

describe("FailedBanner", () => {
  it("explains a failed transcription and offers a retry", async () => {
    const { onRetry, user } = renderBanner({});

    expect(
      screen.getByRole("region", { name: "Couldn't transcribe the recording" }),
    ).toHaveTextContent("Speech-to-text provider is unavailable");
    expect(
      screen.queryByRole("button", { name: "Delete and re-upload" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("tells the user a notes retry keeps the transcript", () => {
    renderBanner({ meeting: failed({ errorStep: "summarize" }) });

    expect(
      screen.getByRole("region", { name: "Couldn't write the notes" }),
    ).toHaveTextContent(/transcript is saved/);
  });

  it("offers a retry for an interrupted run", () => {
    renderBanner({
      meeting: meetingFixture({ status: "transcribing", stalled: true }),
    });

    expect(
      screen.getByRole("region", { name: "Processing was interrupted" }),
    ).toBeVisible();
    expect(retryButton()).toBeEnabled();
  });

  it("offers only deletion when the error is permanent", async () => {
    const { onDelete, user } = renderBanner({
      meeting: failed({ errorRetryable: false }),
      deleteError: "Database unavailable",
    });

    expect(retryButton()).not.toBeInTheDocument();
    expect(screen.getByText(/Retrying won't fix this/)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Delete and re-upload" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("alert")).toHaveTextContent("Database unavailable");
    await user.click(dialog.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("stops offering retries after too many attempts", () => {
    renderBanner({ meeting: failed({ attempts: MAX_ATTEMPTS }) });

    expect(retryButton()).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Retrying…" }));

    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Can't reach the server.",
    );
  });
});
