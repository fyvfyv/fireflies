import type { Meeting, Summary } from "@shared/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const done = meetingFixture();
const overview = "The team agreed to ship the release on Friday.";
const pending = (status: Meeting["status"], overrides: Partial<Meeting> = {}) =>
  meetingFixture({
    status,
    transcriptText: null,
    transcriptSegments: null,
    summary: null,
    ...overrides,
  });
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

const apiError = (status: number, message = "x") =>
  new ApiError({ status, code: "x", message, retryable: false });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function HashProbe() {
  return <output aria-label="Hash">{useLocation().hash}</output>;
}

function renderPage(
  route = "/m/abc",
  options?: Parameters<typeof userEvent.setup>[0],
) {
  const user = userEvent.setup(options);
  renderWithRouter(
    <>
      <MeetingPage />
      <HashProbe />
    </>,
    { path: "/m/:id", route },
  );
  return user;
}

function useWideScreen() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      ({
        matches: media.includes("1180px"),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

type User = ReturnType<typeof userEvent.setup>;

const heading = () => screen.findByRole("heading", { level: 1 });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tab = (name: string | RegExp) => screen.getByRole("tab", { name });
const step = (label: string) =>
  within(screen.getByRole("list", { name: "Processing steps" }))
    .getByText(label)
    .closest("li");
const landedHome = async () =>
  expect(await screen.findByTestId("location")).toHaveTextContent(/^\/$/);

async function openMenu(user: User) {
  await user.click(await screen.findByRole("button", { name: "More actions" }));
  return screen.findByRole("menu");
}

async function confirmDelete(user: User) {
  await openMenu(user);
  await user.click(screen.getByRole("menuitem", { name: "Delete meeting" }));
  return within(
    await screen.findByRole("dialog", { name: "Delete this meeting?" }),
  );
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedProcess.mockReset().mockResolvedValue(done);
  mockedDelete.mockReset().mockResolvedValue();
  mockedAudioUrl.mockReset().mockResolvedValue({
    url: "https://blob.test/abc.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
  localStorage.clear();
});

describe("MeetingPage", () => {
  it("shows a finished meeting", async () => {
    mockedGet.mockResolvedValue({ ...done, language: "english" });
    renderPage();

    expect(await heading()).toHaveTextContent("Weekly sync");
    expect(mockedGet).toHaveBeenCalledWith("abc");
    expect(document.title).toBe("Weekly sync – Recap");
    expect(
      screen.getByRole("list", { name: "Meeting details" }),
    ).toHaveTextContent(/2:05.*English.*Microphone/);
    expect(screen.getByText(overview)).toBeVisible();
    expect(screen.getByRole("region", { name: "Audio player" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Processing steps" })).toBeNull();
    expect(mockedProcess).not.toHaveBeenCalled();
    expect(mockedAudioUrl).not.toHaveBeenCalled();
  });

  it("names a language reported by code", async () => {
    mockedGet.mockResolvedValue({ ...done, language: "de" });
    renderPage();

    expect(await screen.findByText("German")).toBeVisible();
  });

  it("shows a loading state first", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText("Loading meeting…")).toBeInTheDocument();
    expect(document.title).toBe("Meeting – Recap");
    cleanup();
    expect(document.title).toBe("Recap");
  });

  it("renders a not-found state for a missing meeting", async () => {
    mockedGet.mockRejectedValue(apiError(404));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toBeVisible();
    expect(document.title).toBe("Meeting not found – Recap");
    expect(
      screen.getByRole("link", { name: "Back to meetings" }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a load error with a retry", async () => {
    mockedGet
      .mockRejectedValueOnce(apiError(500, "Database unavailable"))
      .mockResolvedValue(done);
    const user = renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    await user.click(button("Try again"));

    expect(await heading()).toHaveTextContent("Weekly sync");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("processing", () => {
    it("starts an uploaded meeting and announces the notes", async () => {
      mockedGet
        .mockResolvedValueOnce(pending("uploaded"))
        .mockResolvedValue(done);
      const run = deferred<Meeting>();
      mockedProcess.mockReturnValue(run.promise);
      renderPage();

      await heading();
      expect(step("Transcript")).toHaveAttribute("aria-current", "step");
      await vi.waitFor(() => expect(mockedProcess).toHaveBeenCalledWith("abc"));

      await act(async () => run.resolve(done));
      expect(await screen.findByText(overview)).toBeVisible();
      expect(screen.getByText("Notes are ready.")).toBeInTheDocument();
    });

    it("offers a retry when the automatic start fails, on any tab", async () => {
      mockedGet.mockResolvedValue(pending("uploaded"));
      mockedProcess
        .mockRejectedValueOnce(apiError(500, "Database unavailable"))
        .mockResolvedValue(done);
      const user = renderPage("/m/abc#actions");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Database unavailable",
      );
      expect(tab(/Action items/)).toHaveAttribute("aria-selected", "true");

      mockedGet.mockResolvedValue(done);
      await user.click(button("Retry"));

      expect(
        await screen.findByRole("checkbox", { name: "Tag the release" }),
      ).toBeVisible();
      expect(mockedProcess).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the steps with a running clock and a notes skeleton", async () => {
      mockedGet.mockResolvedValue(
        pending("transcribing", {
          processingStartedAt: new Date(Date.now() - 42_000).toISOString(),
        }),
      );
      renderPage();

      expect(
        await screen.findByText("Transcribing the recording…"),
      ).toBeVisible();
      expect(screen.getByText(/^0:4\d$/)).toBeVisible();
      expect(screen.getByText("Loading notes…")).toBeInTheDocument();
      expect(tab(/Action items/)).not.toHaveTextContent(/\d/);
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

    it("marks the failed step without a skeleton or clock", async () => {
      mockedGet.mockResolvedValue(failed());
      renderPage();

      await heading();
      expect(step("Notes")).toHaveAttribute("data-state", "error");
      expect(
        screen.getByText("The summary model is unavailable"),
      ).toBeVisible();
      expect(screen.queryByText("Loading notes…")).not.toBeInTheDocument();
      expect(screen.queryByText("Elapsed")).not.toBeInTheDocument();
    });
  });

  describe("retry", () => {
    it("retries a failed meeting, polling while it runs", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      mockedGet
        .mockResolvedValueOnce(failed())
        .mockResolvedValue(
          meetingFixture({ status: "summarizing", summary: null }),
        );
      const run = deferred<Meeting>();
      mockedProcess.mockReturnValue(run.promise);
      const user = renderPage("/m/abc", {
        advanceTimers: vi.advanceTimersByTime,
      });

      await user.click(await screen.findByRole("button", { name: "Retry" }));
      expect(mockedProcess).toHaveBeenCalledWith("abc");
      expect(button("Retrying…")).toHaveAttribute("aria-disabled", "true");

      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(mockedGet).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Writing the notes…")).toBeVisible();
      expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();

      mockedGet.mockResolvedValue(done);
      await act(async () => run.resolve(done));
      expect(await screen.findByText(overview)).toBeVisible();
    });

    it("tolerates a retry that finds the run already started", async () => {
      mockedGet
        .mockResolvedValueOnce(failed())
        .mockResolvedValue(
          meetingFixture({ status: "summarizing", summary: null }),
        );
      mockedProcess.mockRejectedValue(apiError(409));
      const user = renderPage();

      await user.click(await screen.findByRole("button", { name: "Retry" }));

      expect(await screen.findByText("Writing the notes…")).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows why a retry was refused", async () => {
      mockedGet.mockResolvedValue(failed());
      mockedProcess.mockRejectedValue(
        apiError(422, "Too many failed attempts"),
      );
      const user = renderPage();

      await user.click(await screen.findByRole("button", { name: "Retry" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Too many failed attempts",
      );
    });

    it.each([
      ["Couldn't write the notes", failed()],
      [
        "Processing was interrupted",
        meetingFixture({ status: "transcribing", stalled: true }),
      ],
    ])("shows %s and a retry on the transcript tab", async (title, meeting) => {
      mockedGet.mockResolvedValue(meeting);
      renderPage("/m/abc#transcript");

      expect(await screen.findByRole("heading", { name: title })).toBeVisible();
      expect(tab("Transcript")).toHaveAttribute("aria-selected", "true");
      expect(button("Retry")).toBeEnabled();
    });
  });

  describe("delete", () => {
    it("deletes from the menu after a confirmation", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderPage();

      let dialog = await confirmDelete(user);
      await user.click(dialog.getByRole("button", { name: "Cancel" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(mockedDelete).not.toHaveBeenCalled();
      expect(button("More actions")).toHaveFocus();

      dialog = await confirmDelete(user);
      await user.click(dialog.getByRole("button", { name: "Delete" }));

      expect(mockedDelete).toHaveBeenCalledWith("abc");
      await landedHome();
      expect(
        within(screen.getByRole("region", { name: "Notifications" })).getByText(
          "Meeting deleted",
        ),
      ).toBeVisible();
    });

    it("treats an already deleted meeting as deleted", async () => {
      mockedGet.mockResolvedValue(done);
      mockedDelete.mockRejectedValue(apiError(404));
      const user = renderPage();

      const dialog = await confirmDelete(user);
      await user.click(dialog.getByRole("button", { name: "Delete" }));

      await landedHome();
    });

    it("shows a failed delete and stays on the page", async () => {
      mockedGet.mockResolvedValue(done);
      mockedDelete.mockRejectedValue(apiError(500, "Database unavailable"));
      const user = renderPage();

      const dialog = await confirmDelete(user);
      await user.click(dialog.getByRole("button", { name: "Delete" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent(
        "Database unavailable",
      );
      expect(
        dialog.getByRole("button", { name: "Delete" }),
      ).not.toHaveAttribute("aria-busy");
      expect(screen.queryByTestId("location")).not.toBeInTheDocument();
    });

    it("offers delete and re-upload when a retry can't help", async () => {
      mockedGet.mockResolvedValue(failed({ errorRetryable: false }));
      const user = renderPage();

      await user.click(
        await screen.findByRole("button", { name: "Delete and re-upload" }),
      );
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Delete",
        }),
      );

      expect(mockedDelete).toHaveBeenCalledWith("abc");
      await landedHome();
    });
  });

  describe("tabs", () => {
    it("switches between notes, action items and the transcript", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderPage();
      const hash = () => screen.getByRole("status", { name: "Hash" });

      await heading();
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
        within(screen.getByRole("tabpanel")).getByRole("searchbox"),
      ).toBeVisible();

      await user.click(tab("Notes"));
      expect(hash()).toHaveTextContent("#notes");
    });

    it.each([
      ["#actions", /Action items/],
      ["#transcript", "Transcript"],
      ["#nonsense", "Notes"],
    ])("opens %s from the link", async (hash, name) => {
      mockedGet.mockResolvedValue(done);
      renderPage(`/m/abc${hash}`);

      await heading();
      expect(tab(name)).toHaveAttribute("aria-selected", "true");
    });

    it.each([
      ["scrolled past the tabs", -300, 1],
      ["with the tabs in view", 20, 0],
    ])("starts a new tab at its top when %s", async (_, top, calls) => {
      const rect = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          return this.querySelector(":scope > [role='tablist']")
            ? DOMRect.fromRect({ y: top, width: 400, height: 900 })
            : rect.call(this);
        },
      );
      const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
      mockedGet.mockResolvedValue(done);
      const user = renderPage();
      await heading();
      const tabsRoot = screen.getByRole("tablist").parentElement;

      await user.click(tab("Transcript"));
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      expect(scroll.mock.contexts.filter((el) => el === tabsRoot)).toHaveLength(
        calls,
      );
    });
  });

  describe("on wide screens", () => {
    it("keeps the transcript beside the notes", async () => {
      useWideScreen();
      mockedGet.mockResolvedValue(done);
      renderPage("/m/abc#transcript");

      await heading();
      expect(screen.getAllByRole("tab")).toHaveLength(2);
      expect(tab("Notes")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText(overview)).toBeVisible();
      expect(
        within(screen.getByRole("region", { name: "Transcript" })).getByText(
          "Hello team, let's ship the release on Friday.",
        ),
      ).toBeVisible();
    });

    it("ends the transcript rail above the player bar", async () => {
      useWideScreen();
      let railTop = 129;
      const rect = Element.prototype.getBoundingClientRect;
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          return this.tagName === "ASIDE"
            ? DOMRect.fromRect({ y: railTop, width: 400, height: 500 })
            : rect.call(this);
        },
      );
      mockedGet.mockResolvedValue(done);
      renderPage();

      const rail = (
        await screen.findByRole("region", { name: "Transcript" })
      ).closest("aside");
      const top = () => rail?.style.getPropertyValue("--rail-top");
      expect(top()).toBe("129px");

      railTop = -40;
      act(() => {
        window.dispatchEvent(new Event("scroll"));
      });
      await waitFor(() => expect(top()).toBe("16px"));
    });
  });

  describe("actions", () => {
    it("copies the link, the notes and the transcript", async () => {
      mockedGet.mockResolvedValue(done);
      const user = renderPage("/m/abc#actions");

      await user.click(
        await screen.findByRole("button", { name: "Copy link" }),
      );
      expect(await screen.findByText("Link copied")).toBeVisible();
      await expect(navigator.clipboard.readText()).resolves.toBe(
        `${window.location.origin}/m/abc#actions`,
      );

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
      mockedGet.mockResolvedValue(pending("transcribing"));
      const user = renderPage();

      await openMenu(user);

      for (const name of ["Copy notes", "Copy transcript"]) {
        expect(screen.getByRole("menuitem", { name })).toHaveAttribute(
          "aria-disabled",
          "true",
        );
      }
    });

    it("opens the recording in a new tab, or closes it on failure", async () => {
      const tabWindow = {
        opener: {},
        location: { href: "" },
        close: vi.fn(),
      };
      vi.spyOn(window, "open").mockReturnValue(tabWindow as unknown as Window);
      mockedGet.mockResolvedValue(done);
      const user = renderPage();
      const download = async () => {
        await openMenu(user);
        await user.click(
          screen.getByRole("menuitem", { name: "Download audio" }),
        );
      };

      await download();
      await waitFor(() =>
        expect(tabWindow.location.href).toBe("https://blob.test/abc.webm"),
      );
      expect(tabWindow.opener).toBeNull();

      mockedAudioUrl.mockRejectedValue(apiError(404, "Audio not found"));
      await download();
      expect(await screen.findByText("Audio not found")).toBeVisible();
      expect(tabWindow.close).toHaveBeenCalled();
    });
  });

  it("plays from a note's timestamp", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play");
    mockedGet.mockResolvedValue(done);
    const user = renderPage();

    const notes = within(
      await screen.findByRole("region", { name: "Release tasks" }),
    );
    await user.click(notes.getByRole("button", { name: "Play from 1:10" }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(
      within(screen.getByRole("region", { name: "Audio player" })).getByText(
        "1:10",
      ),
    ).toBeVisible();
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

  it("generates detailed notes for a legacy summary", async () => {
    const legacy = meetingFixture({
      summary: { ...(done.summary as Summary), keywords: [], notes: [] },
    });
    mockedGet.mockResolvedValueOnce(legacy).mockResolvedValue(done);
    vi.mocked(regenerateNotes).mockResolvedValue(done);
    const user = renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Generate detailed notes" }),
    );

    expect(regenerateNotes).toHaveBeenCalledWith("abc");
    expect(
      await screen.findByRole("region", { name: "Release timeline" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Generate detailed notes" }),
    ).not.toBeInTheDocument();
  });
});
