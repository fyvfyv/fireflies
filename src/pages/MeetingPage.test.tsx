import { MAX_ATTEMPTS } from "@shared/constants";
import type { Meeting, Summary } from "@shared/schemas";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/AppProviders";
import {
  ApiError,
  deleteMeeting,
  getAudioUrl,
  getMeeting,
  processMeeting,
  regenerateNotes,
} from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { MeetingPage } from "./MeetingPage";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMeeting: vi.fn(),
  processMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
  getAudioUrl: vi.fn(),
  regenerateNotes: vi.fn(),
}));

const mockedGet = vi.mocked(getMeeting);
const mockedProcess = vi.mocked(processMeeting);
const mockedDelete = vi.mocked(deleteMeeting);
const mockedAudioUrl = vi.mocked(getAudioUrl);
const mockedRegenerate = vi.mocked(regenerateNotes);

const done = meetingFixture();
const overview = "The team agreed to ship the release on Friday.";
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

function HashProbe() {
  return <output aria-label="Hash">{useLocation().hash}</output>;
}

/** Like renderPage, but at any URL and with the hash on screen. */
function renderAt(route: string) {
  const user = userEvent.setup();
  const router = createMemoryRouter(
    [
      {
        path: "/m/:id",
        element: (
          <>
            <MeetingPage />
            <HashProbe />
          </>
        ),
      },
    ],
    { initialEntries: [route] },
  );
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return user;
}

function useWideScreen() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media: string) =>
      ({
        matches: media.includes("1180px"),
        media,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
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

const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "More actions" }));
  return screen.findByRole("menu");
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
  return screen.findByRole("dialog", { name: "Delete this meeting?" });
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedProcess.mockReset().mockResolvedValue(done);
  mockedDelete.mockReset().mockResolvedValue();
  mockedRegenerate.mockReset();
  mockedAudioUrl.mockReset().mockResolvedValue({
    url: "https://blob.test/abc.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
  localStorage.clear();
});

describe("MeetingPage", () => {
  it("shows a finished meeting", async () => {
    mockedGet.mockResolvedValue(done);
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Weekly sync" }),
    ).toBeVisible();
    expect(mockedGet).toHaveBeenCalledWith("abc");
    const details = within(
      screen.getByRole("list", { name: "Meeting details" }),
    );
    expect(details.getByText("Microphone")).toBeVisible();
    expect(details.getByText("2:05")).toBeVisible();
    expect(details.getByText("English")).toBeVisible();
    expect(screen.queryByText(/whisper/)).not.toBeInTheDocument();
    expect(screen.getByText(overview)).toBeVisible();
    // The player's scrubber is the only tape.
    expect(
      screen.queryByRole("group", { name: "Topics over time" }),
    ).toBeNull();
    expect(screen.getAllByRole("slider", { name: "Seek" })).toHaveLength(1);
    expect(document.title).toBe("Weekly sync – Recap");
    expect(
      screen.queryByRole("list", { name: "Processing steps" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meetings" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("region", { name: "Audio player" })).toBeVisible();
    expect(mockedProcess).not.toHaveBeenCalled();
    expect(mockedAudioUrl).not.toHaveBeenCalled();
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
    expect(document.title).toBe("Meeting – Recap");
    cleanup();
    expect(document.title).toBe("Recap");
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
    expect(step("Transcript")).toHaveAttribute("aria-current", "step");
    // The start is fired from an effect, which may run after the first paint.
    await vi.waitFor(() => expect(mockedProcess).toHaveBeenCalledWith("abc"));

    await act(async () => run.resolve(done));
    expect(await screen.findByText(overview)).toBeVisible();
    expect(screen.getByText("Notes are ready.")).toBeInTheDocument();
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

    expect(await screen.findByText(overview)).toBeVisible();
    expect(mockedProcess).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the processing steps with a running clock and a skeleton", async () => {
    mockedGet.mockResolvedValue(
      meetingFixture({
        status: "transcribing",
        transcriptText: null,
        transcriptSegments: null,
        summary: null,
        processingStartedAt: new Date(Date.now() - 42_000).toISOString(),
      }),
    );
    renderPage();

    expect(
      await screen.findByText("Transcribing the recording…"),
    ).toBeVisible();
    // Said once, by the steps; the transcript tab doesn't repeat it.
    expect(screen.getAllByText("Transcribing the recording…")).toHaveLength(1);
    expect(
      screen.getByText("Longer recordings take up to a minute."),
    ).toBeVisible();
    expect(screen.getByText("Elapsed")).toBeInTheDocument();
    expect(screen.getByText(/^0:4\d$/)).toBeVisible();
    expect(screen.getByText("Loading notes…")).toBeInTheDocument();
    expect(tab(/Action items/)).not.toHaveTextContent(/\d/);
    expect(
      screen.queryByRole("group", { name: "Topics over time" }),
    ).toBeNull();
  });

  it("reports transcribing once on wide screens too", async () => {
    useWideScreen();
    mockedGet.mockResolvedValue(
      meetingFixture({
        status: "transcribing",
        transcriptText: null,
        transcriptSegments: null,
        summary: null,
      }),
    );
    renderPage();

    expect(
      await screen.findByText("Transcribing the recording…"),
    ).toBeVisible();
    expect(screen.getAllByText("Transcribing the recording…")).toHaveLength(1);
    expect(
      within(screen.getByRole("region", { name: "Transcript" })).getByText(
        "The transcript appears here once the recording is transcribed.",
      ),
    ).toBeVisible();
  });

  it("shows the transcript while the notes are written", async () => {
    mockedGet.mockResolvedValue(
      meetingFixture({ status: "summarizing", summary: null }),
    );
    const user = renderPage();

    await user.click(await screen.findByRole("tab", { name: "Transcript" }));

    expect(
      within(screen.getByRole("tabpanel")).getByText(
        "Hello team, let's ship the release on Friday.",
      ),
    ).toBeVisible();
  });

  it("marks the failed step", async () => {
    mockedGet.mockResolvedValue(failed());
    renderPage();

    await screen.findByRole("heading", { level: 1 });
    expect(step("Transcript")).toHaveAttribute("data-state", "done");
    expect(step("Notes")).toHaveAttribute("data-state", "error");
    expect(screen.getByText("The summary model is unavailable")).toBeVisible();
    expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument();
    expect(screen.queryByText("Elapsed")).not.toBeInTheDocument();
  });

  it("retries a failed meeting and refetches it", async () => {
    mockedGet.mockResolvedValueOnce(failed()).mockResolvedValue(done);
    const user = renderPage();

    await user.click(await screen.findByRole("button", { name: "Retry" }));

    expect(mockedProcess).toHaveBeenCalledWith("abc");
    expect(await screen.findByText(overview)).toBeVisible();
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

    expect(await screen.findByText("Writing the notes…")).toBeVisible();
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
    expect(screen.getByRole("button", { name: "Retrying…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Writing the notes…")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Retry/ }),
    ).not.toBeInTheDocument();

    mockedGet.mockResolvedValue(done);
    await act(async () => run.resolve(done));
    expect(await screen.findByText(overview)).toBeVisible();
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
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockedDelete).toHaveBeenCalledWith("abc");
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("deletes from the menu after a confirmation", async () => {
    mockedGet.mockResolvedValue(done);
    const user = renderPage();

    let dialog = await confirmDelete(user);
    expect(dialog).toHaveTextContent("This can't be undone.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mockedDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();

    dialog = await confirmDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(mockedDelete).toHaveBeenCalledWith("abc");
    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
    // The confirmation outlives the page it was shown on.
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByText(
        "Meeting deleted",
      ),
    ).toBeVisible();
  });

  it("treats an already deleted meeting as deleted", async () => {
    mockedGet.mockResolvedValue(done);
    mockedDelete.mockRejectedValue(apiError(404, "not_found"));
    const user = renderPage();

    const dialog = await confirmDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("shows a failed delete and stays on the page", async () => {
    mockedGet.mockResolvedValue(done);
    mockedDelete.mockRejectedValue(
      apiError(500, "internal", "Database unavailable"),
    );
    const user = renderPage();

    const dialog = await confirmDelete(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).not.toHaveAttribute("aria-busy");
  });

  it("renders a not-found state for a missing meeting", async () => {
    mockedGet.mockRejectedValue(apiError(404, "not_found"));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    expect(document.title).toBe("Meeting not found – Recap");
    expect(
      screen.getByRole("link", { name: "Back to meetings" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByRole("region", { name: "Audio player" }),
    ).not.toBeInTheDocument();
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

  describe("tabs", () => {
    it("switches between notes, action items and the transcript", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderAt("/m/abc");
      const hash = () => screen.getByRole("status", { name: "Hash" });

      await screen.findByRole("heading", { level: 1 });
      expect(tab("Notes")).toHaveAttribute("aria-selected", "true");
      expect(tab(/Action items/)).toHaveTextContent("1");

      await user.click(tab(/Action items/));
      expect(hash()).toHaveTextContent("#actions");
      const panel = within(screen.getByRole("tabpanel"));
      expect(
        panel.getByRole("checkbox", { name: "Tag the release" }),
      ).toBeVisible();
      expect(panel.queryByText(overview)).not.toBeInTheDocument();

      await user.click(tab("Transcript"));
      expect(hash()).toHaveTextContent("#transcript");
      expect(
        within(screen.getByRole("tabpanel")).getByRole("searchbox", {
          name: "Search transcript",
        }),
      ).toBeVisible();

      await user.click(tab("Notes"));
      expect(hash()).toHaveTextContent("#notes");
    });

    it.each([
      ["scrolled past the tabs", -300, 1],
      ["with the tabs in view", 20, 0],
    ])("starts a new tab at its top when %s", async (_, top, calls) => {
      const rect = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          return this.querySelector(":scope > [role='tablist']")
            ? DOMRect.fromRect({ x: 0, y: top, width: 400, height: 900 })
            : rect.call(this);
        },
      );
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      mockedGet.mockResolvedValue(done);
      const user = renderAt("/m/abc");
      await screen.findByRole("heading", { level: 1 });
      const tabsRoot = screen.getByRole("tablist").parentElement;

      await user.click(tab("Transcript"));
      // Give the scheduled frame a chance to run.
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      const onTabs = scroll.mock.contexts.filter((el) => el === tabsRoot);
      expect(onTabs).toHaveLength(calls);
      if (calls > 0) {
        expect(scroll).toHaveBeenCalledWith({ block: "start" });
      }
      // Below 1180px the tab row sticks to the top of the window.
      expect(screen.getByRole("tablist")).toHaveClass(
        "max-[1180px]:sticky",
        "max-[1180px]:top-0",
      );
    });

    it.each([
      ["#actions", /Action items/],
      ["#transcript", "Transcript"],
      ["#nonsense", "Notes"],
    ])("opens %s from the link", async (hash, name) => {
      mockedGet.mockResolvedValue(done);
      renderAt(`/m/abc${hash}`);

      await screen.findByRole("heading", { level: 1 });
      expect(tab(name)).toHaveAttribute("aria-selected", "true");
    });

    it.each([
      ["#actions", /Action items/],
      ["#transcript", "Transcript"],
    ])("shows a failed run and its retry on %s", async (hash, name) => {
      mockedGet.mockResolvedValue(failed());
      renderAt(`/m/abc${hash}`);

      await screen.findByRole("heading", { level: 1 });
      expect(tab(name)).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByRole("heading", { name: "Couldn't write the notes" }),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    });

    it("shows a failed start and its retry outside the notes tab", async () => {
      mockedGet.mockResolvedValue(
        meetingFixture({
          status: "uploaded",
          transcriptText: null,
          transcriptSegments: null,
          summary: null,
        }),
      );
      mockedProcess.mockRejectedValue(
        apiError(500, "internal", "Database unavailable"),
      );
      renderAt("/m/abc#actions");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Database unavailable",
      );
      expect(tab(/Action items/)).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    });

    it("says when no action items were mentioned", async () => {
      mockedGet.mockResolvedValue(
        meetingFixture({
          summary: { ...(done.summary as Summary), actionItems: [] },
        }),
      );
      renderAt("/m/abc#actions");

      expect(
        await screen.findByText("No action items were mentioned."),
      ).toBeVisible();
      expect(tab(/Action items/)).toHaveTextContent("0");
    });
  });

  describe("on wide screens", () => {
    it("ends the transcript rail above the player bar", async () => {
      useWideScreen();
      // The rail starts below the page header and sticks 16 px from the top.
      let railTop = 129;
      const rect = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          return this.tagName === "ASIDE"
            ? DOMRect.fromRect({ x: 0, y: railTop, width: 400, height: 500 })
            : rect.call(this);
        },
      );
      mockedGet.mockResolvedValue(done);
      renderAt("/m/abc");

      const rail = (
        await screen.findByRole("region", { name: "Transcript" })
      ).closest("aside") as HTMLElement;
      const top = () => rail.style.getPropertyValue("--rail-top");
      expect(top()).toBe("129px");
      expect(rail.className).toContain("var(--rail-top");

      railTop = -40;
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      await waitFor(() => expect(top()).toBe("16px"));
    });

    it("keeps the transcript beside the notes", async () => {
      useWideScreen();
      mockedGet.mockResolvedValue(done);
      renderAt("/m/abc#transcript");

      await screen.findByRole("heading", { level: 1 });
      expect(screen.getAllByRole("tab")).toHaveLength(2);
      expect(tab("Notes")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText(overview)).toBeVisible();
      const rail = screen.getByRole("region", { name: "Transcript" });
      expect(
        within(rail).getByText("Hello team, let's ship the release on Friday."),
      ).toBeVisible();
    });
  });

  describe("actions", () => {
    it("copies a link to the meeting", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Copy link" }),
      );

      expect(await screen.findByText("Link copied")).toBeVisible();
      await expect(navigator.clipboard.readText()).resolves.toBe(
        `${window.location.origin}/m/abc`,
      );
    });

    it("copies the notes and the transcript from the menu", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      await openMenu(user);
      await user.click(screen.getByRole("menuitem", { name: "Copy notes" }));
      expect(await screen.findByText("Notes copied")).toBeVisible();
      await expect(navigator.clipboard.readText()).resolves.toMatch(
        /^# Weekly sync/,
      );

      await openMenu(user);
      await user.click(
        screen.getByRole("menuitem", { name: "Copy transcript" }),
      );
      expect(await screen.findByText("Transcript copied")).toBeVisible();
      await expect(navigator.clipboard.readText()).resolves.toBe(
        "[00:00] Hello team, let's ship the release on Friday.",
      );
    });

    it("disables copying what doesn't exist yet", async () => {
      mockedGet.mockResolvedValue(
        meetingFixture({
          status: "transcribing",
          transcriptText: null,
          transcriptSegments: null,
          summary: null,
        }),
      );
      const user = renderPage();

      await openMenu(user);

      expect(
        screen.getByRole("menuitem", { name: "Copy notes" }),
      ).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByRole("menuitem", { name: "Copy transcript" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("opens the recording in a new tab", async () => {
      const tabWindow = {
        opener: {} as unknown,
        location: { href: "" },
        close: vi.fn(),
      };
      const open = vi
        .spyOn(window, "open")
        .mockReturnValue(tabWindow as unknown as Window);
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      await openMenu(user);
      await user.click(
        screen.getByRole("menuitem", { name: "Download audio" }),
      );

      expect(open).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(tabWindow.location.href).toBe("https://blob.test/abc.webm"),
      );
      expect(tabWindow.opener).toBeNull();
      expect(mockedAudioUrl).toHaveBeenCalledWith("abc");
    });

    it("closes the tab and explains when the recording can't be fetched", async () => {
      const tabWindow = {
        opener: null,
        location: { href: "" },
        close: vi.fn(),
      };
      vi.spyOn(window, "open").mockReturnValue(tabWindow as unknown as Window);
      mockedAudioUrl.mockRejectedValue(
        apiError(404, "audio_missing", "Audio not found"),
      );
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      await openMenu(user);
      await user.click(
        screen.getByRole("menuitem", { name: "Download audio" }),
      );

      expect(await screen.findByText("Audio not found")).toBeVisible();
      expect(tabWindow.close).toHaveBeenCalled();
    });
  });

  describe("playback", () => {
    it("plays from a note's timestamp", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      const notes = within(
        await screen.findByRole("region", { name: "Release tasks" }),
      );
      await user.click(
        notes.getAllByRole("button", {
          name: "Play from 1:10",
        })[0] as HTMLElement,
      );

      await waitFor(() => expect(play).toHaveBeenCalled());
      expect(mockedAudioUrl).toHaveBeenCalledWith("abc");
      expect(document.querySelector("audio")).toHaveAttribute(
        "src",
        "https://blob.test/abc.webm",
      );
      const player = within(
        screen.getByRole("region", { name: "Audio player" }),
      );
      expect(player.getByText("1:10")).toBeVisible();
    });

    it("toggles playback with Space", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      mockedGet.mockResolvedValue(done);
      const user = renderPage();
      await screen.findByRole("heading", { level: 1 });

      await user.keyboard(" ");

      await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    });

    it("lifts toasts above the player", async () => {
      mockedGet.mockResolvedValue(done);
      renderPage();
      await screen.findByRole("region", { name: "Audio player" });

      expect(
        screen
          .getByRole("region", { name: "Notifications" })
          .style.getPropertyValue("--toast-offset"),
      ).not.toBe("0px");
    });
  });

  describe("legacy summaries", () => {
    const legacy = meetingFixture({
      transcriptText: "Hello team, let's ship the release on Friday.",
      summary: { ...(done.summary as Summary), keywords: [], notes: [] },
    });

    it("generates detailed notes and shows them", async () => {
      mockedGet.mockResolvedValueOnce(legacy).mockResolvedValue(done);
      mockedRegenerate.mockResolvedValue(done);
      const user = renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Generate detailed notes" }),
      );

      expect(mockedRegenerate).toHaveBeenCalledWith("abc");
      expect(
        await screen.findByRole("region", { name: "Release timeline" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Generate detailed notes" }),
      ).not.toBeInTheDocument();
    });
  });
});
