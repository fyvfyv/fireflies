import { MAX_ATTEMPTS } from "@shared/constants";
import type { Meeting } from "@shared/schemas";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, deleteMeeting, getMeeting, processMeeting } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { MeetingPage } from "./MeetingPage";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMeeting: vi.fn(),
  processMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
}));

const mockedGet = vi.mocked(getMeeting);
const mockedProcess = vi.mocked(processMeeting);
const mockedDelete = vi.mocked(deleteMeeting);

const done = meetingFixture();
const failed = (overrides: Partial<Meeting> = {}) =>
  meetingFixture({
    status: "failed",
    summary: null,
    errorStep: "summarize",
    errorMessage: "The summary model is unavailable",
    errorRetryable: true,
    attempts: 1,
    ...overrides,
  });

const apiError = (status: number, code: string, message = code) =>
  new ApiError({ status, code, message, retryable: false });

function renderPage(options?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(options);
  renderWithRouter(<MeetingPage />, { path: "/m/:id", route: "/m/abc" });
  return user;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const step = (label: string) =>
  within(screen.getByRole("list", { name: "Processing steps" }))
    .getByText(label)
    .closest("li");

beforeEach(() => {
  mockedGet.mockReset();
  mockedProcess.mockReset().mockResolvedValue(done);
  mockedDelete.mockReset().mockResolvedValue();
});

describe("MeetingPage", () => {
  it("shows a finished meeting", async () => {
    mockedGet.mockResolvedValue(done);
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith("abc");
    expect(step("Done")).toHaveAttribute("data-state", "done");
    expect(screen.getByText("Microphone")).toBeVisible();
    expect(screen.getByText("2 min")).toBeVisible();
    expect(screen.getByText("English")).toBeVisible();
    expect(screen.getByText(/gateway:openai\/whisper-1/)).toBeVisible();
    expect(
      screen.getByText("The team agreed to ship the release on Friday."),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Transcript" })).toBeVisible();
    expect(screen.getByRole("link", { name: /All meetings/ })).toHaveAttribute(
      "href",
      "/",
    );
    expect(mockedProcess).not.toHaveBeenCalled();
  });

  it.each([
    ["english", "English"],
    ["de", "German"],
  ])("shows the reported language %s as %s", async (language, expected) => {
    mockedGet.mockResolvedValue(meetingFixture({ language }));
    renderPage();

    expect(await screen.findByText(expected)).toBeVisible();
  });

  it("shows a loading state first", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading meeting…")).toBeInTheDocument();
  });

  it("starts processing an uploaded meeting", async () => {
    mockedGet
      .mockResolvedValueOnce(
        meetingFixture({
          status: "uploaded",
          transcriptText: null,
          transcriptSegments: null,
          summary: null,
        }),
      )
      .mockResolvedValue(done);
    const run = deferred<Meeting>();
    mockedProcess.mockReturnValue(run.promise);
    renderPage();

    await screen.findByRole("heading", { level: 1 });
    expect(step("Transcribing")).toHaveAttribute("aria-current", "step");
    // The start is fired from an effect, which may run after the first paint.
    await vi.waitFor(() => expect(mockedProcess).toHaveBeenCalledWith("abc"));

    await act(async () => run.resolve(done));
    expect(await screen.findByText("Summary ready")).toBeVisible();
  });

  it("offers a retry when the automatic start fails", async () => {
    const waiting = meetingFixture({
      status: "uploaded",
      transcriptText: null,
      transcriptSegments: null,
      summary: null,
    });
    mockedGet.mockResolvedValue(waiting);
    mockedProcess
      .mockRejectedValueOnce(apiError(500, "internal", "Database unavailable"))
      .mockResolvedValue(done);
    const user = renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.getByText("Starting…")).toBeVisible();

    mockedGet.mockResolvedValue(done);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Summary ready")).toBeVisible();
    expect(mockedProcess).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks the failed step", async () => {
    mockedGet.mockResolvedValue(failed());
    renderPage();

    await screen.findByRole("heading", { level: 1 });
    expect(step("Transcribing")).toHaveAttribute("data-state", "done");
    expect(step("Summarizing")).toHaveAttribute("data-state", "error");
    expect(screen.getByText("The summary model is unavailable")).toBeVisible();
  });

  it("retries a failed meeting and refetches it", async () => {
    mockedGet.mockResolvedValueOnce(failed()).mockResolvedValue(done);
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(mockedProcess).toHaveBeenCalledWith("abc");
    expect(await screen.findByText("Summary ready")).toBeVisible();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });

  it("tolerates a retry that finds the run already started", async () => {
    mockedGet
      .mockResolvedValueOnce(failed())
      .mockResolvedValue(
        meetingFixture({ status: "summarizing", summary: null }),
      );
    mockedProcess.mockRejectedValue(apiError(409, "already_processing"));
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Writing the summary…")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows why a retry was refused", async () => {
    mockedGet.mockResolvedValue(failed());
    mockedProcess.mockRejectedValue(
      apiError(422, "give_up", "Too many failed attempts"),
    );
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many failed attempts",
    );
  });

  it("keeps polling while a retry runs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGet
      .mockResolvedValueOnce(failed())
      .mockResolvedValue(
        meetingFixture({ status: "summarizing", summary: null }),
      );
    const run = deferred<Meeting>();
    mockedProcess.mockReturnValue(run.promise);
    const user = renderPage({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Writing the summary…")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Retry/ }),
    ).not.toBeInTheDocument();

    mockedGet.mockResolvedValue(done);
    await act(async () => run.resolve(done));
    expect(await screen.findByText("Summary ready")).toBeVisible();
  });

  it("offers a retry for an interrupted run", async () => {
    mockedGet.mockResolvedValue(
      meetingFixture({ status: "transcribing", summary: null, stalled: true }),
    );
    renderPage();

    expect(
      await screen.findByText("Processing was interrupted", { selector: "h2" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it.each([
    ["the error is permanent", failed({ errorRetryable: false })],
    ["attempts are exhausted", failed({ attempts: MAX_ATTEMPTS })],
  ])("offers delete and re-upload when %s", async (_, meeting) => {
    mockedGet.mockResolvedValue(meeting);
    const user = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete and re-upload" }),
    );
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(mockedDelete).toHaveBeenCalledWith("abc");
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("deletes after an inline confirmation", async () => {
    mockedGet.mockResolvedValue(done);
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockedDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(mockedDelete).toHaveBeenCalledWith("abc");
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("treats an already deleted meeting as deleted", async () => {
    mockedGet.mockResolvedValue(done);
    mockedDelete.mockRejectedValue(apiError(404, "not_found"));
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("shows a failed delete and stays on the page", async () => {
    mockedGet.mockResolvedValue(done);
    mockedDelete.mockRejectedValue(
      apiError(500, "internal", "Database unavailable"),
    );
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm delete" }),
    ).toBeEnabled();
  });

  it("renders a not-found card for a missing meeting", async () => {
    mockedGet.mockRejectedValue(apiError(404, "not_found"));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /All meetings/ })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows a load error with a retry", async () => {
    mockedGet
      .mockRejectedValueOnce(apiError(500, "internal", "Database unavailable"))
      .mockResolvedValue(done);
    const user = renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
