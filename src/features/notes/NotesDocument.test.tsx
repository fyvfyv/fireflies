import type { Meeting, NoteSection, Summary } from "@shared/schemas";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { PlayerProvider, usePlayer } from "@/features/player/PlayerProvider";
import { getAudioUrl } from "@/lib/api";
import { meetingFixture } from "@/test/fixtures";
import { NotesDocument } from "./NotesDocument";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  regenerateNotes: vi.fn(),
  getAudioUrl: vi.fn(),
}));

const baseSummary = meetingFixture().summary as Summary;

let nextId = 0;
function meeting(overrides: Partial<Meeting> = {}) {
  nextId += 1;
  return meetingFixture({ id: `notes-${nextId}`, ...overrides });
}

function renderDocument(value: Meeting = meeting()) {
  return render(
    <>
      <NotesDocument meeting={value} onUpdated={vi.fn()} />
      <Toaster />
    </>,
  );
}

const listOf = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

afterEach(() => {
  localStorage.clear();
});

describe("NotesDocument", () => {
  it("renders the overview, topic sections, action items and decisions", () => {
    renderDocument();

    expect(
      screen.getByText("The team agreed to ship the release on Friday."),
    ).toBeVisible();
    expect(listOf("Keywords")).toEqual(["release", "Friday"]);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Release timeline",
      "Release tasks",
      "Action items",
      "Decisions",
    ]);
    const timeline = within(
      screen.getByRole("region", { name: "Release timeline" }),
    );
    expect(timeline.getByText("The team set the release date.")).toBeVisible();
    expect(timeline.getByText("ship on Friday").tagName).toBe("STRONG");
    expect(timeline.getByText("QA signs off on Thursday")).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Action items" })).getByRole(
        "checkbox",
        { name: "Tag the release" },
      ),
    ).toBeVisible();
    expect(listOf("Decisions")).toEqual(["Ship on Friday"]);
    expect(
      screen.queryByRole("heading", { name: "Key takeaways" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("leaves out empty lists and notes a truncated transcript", () => {
    renderDocument(
      meeting({
        transcriptTruncated: true,
        summary: {
          ...baseSummary,
          keywords: [],
          actionItems: [],
          decisions: [],
        },
      }),
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "Keywords" })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/too long/i);
  });

  it("copies the notes", async () => {
    renderDocument();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Copy notes" }));

    expect(await screen.findByText("Notes copied")).toBeVisible();
    await expect(navigator.clipboard.readText()).resolves.toMatch(
      /^# Weekly sync\n/,
    );
  });

  it("plays the reveal once per meeting", () => {
    const value = meeting();
    const first = renderDocument(value);
    const animated = () => document.querySelectorAll(".animate-reveal").length;
    expect(animated()).toBeGreaterThan(0);

    first.rerender(
      <NotesDocument
        meeting={{ ...value, updatedAt: "2026-09-16T12:00:05.000Z" }}
        onUpdated={vi.fn()}
      />,
    );
    first.unmount();

    renderDocument(value);
    expect(animated()).toBe(0);
  });

  describe("topic sections and playback", () => {
    function timed(durationSeconds: number | null = 100) {
      const [first, second] = baseSummary.notes as [NoteSection, NoteSection];
      return meeting({
        durationSeconds,
        summary: {
          ...baseSummary,
          notes: [
            first,
            {
              ...second,
              startSecond: 40,
              points: [{ text: "Ana tags it", startSecond: 40, details: [] }],
            },
          ],
        },
      });
    }

    function Position() {
      const { currentTime } = usePlayer();
      return <output aria-label="Position">{currentTime}</output>;
    }

    function renderPlaying() {
      vi.mocked(getAudioUrl).mockResolvedValue({
        url: "https://blob.test/a.webm",
        expiresAt: "2026-09-17T13:00:00.000Z",
      });
      const value = timed();
      render(
        <PlayerProvider meetingId={value.id} durationSeconds={100}>
          <NotesDocument meeting={value} onUpdated={vi.fn()} />
          <Position />
        </PlayerProvider>,
      );
      const audio = document.querySelector("audio") as HTMLAudioElement;
      const playTo = (seconds: number) =>
        act(() => {
          audio.currentTime = seconds;
          audio.dispatchEvent(new Event("timeupdate"));
        });
      return { playTo };
    }

    it("shows each section's time range after its heading", () => {
      const { rerender } = renderDocument(timed());

      expect(
        screen.getByRole("button", {
          name: "Play Release timeline, 0:00 to 0:40",
        }),
      ).toHaveTextContent(/^0:00–0:40$/);
      expect(
        screen.getByRole("button", {
          name: "Play Release tasks, 0:40 to 1:40",
        }),
      ).toBeVisible();
      expect(
        within(
          screen.getByRole("region", { name: "Release timeline" }),
        ).getByRole("button", { name: "Play from 0:00" }),
      ).toBeVisible();

      rerender(<NotesDocument meeting={timed(null)} onUpdated={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Play Release timeline, 0:00" }),
      ).toHaveTextContent(/^0:00$/);
    });

    it("plays a section from its start", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      renderPlaying();
      const range = screen.getByRole("button", {
        name: "Play Release tasks, 0:40 to 1:40",
      });

      await userEvent.setup().click(range);
      await act(() => Promise.resolve());

      expect(
        screen.getByRole("status", { name: "Position" }),
      ).toHaveTextContent("40");
      expect(play).toHaveBeenCalledTimes(1);
      expect(range).not.toHaveFocus();
    });

    it("marks the playing section's swatch", () => {
      const { playTo } = renderPlaying();
      const active = () =>
        [...document.querySelectorAll("[data-slot='topic-swatch']")].map(
          (swatch) => swatch.hasAttribute("data-active"),
        );
      expect(active()).toEqual([false, false]);

      playTo(45);
      expect(active()).toEqual([false, true]);

      playTo(10);
      expect(active()).toEqual([true, false]);
    });
  });

  describe("legacy summaries", () => {
    const legacy = (transcriptText: string) =>
      meeting({
        transcriptText,
        summary: { ...baseSummary, keywords: [], notes: [] },
      });

    const offer = { name: "Generate detailed notes" };

    it("keeps the overview and lists, and offers detailed notes", () => {
      renderDocument(legacy("One two three four five six seven."));

      expect(
        screen.getByText("The team agreed to ship the release on Friday."),
      ).toBeVisible();
      expect(listOf("Key takeaways")).toEqual(["Release is on track"]);
      expect(screen.getByRole("button", offer)).toBeVisible();
    });

    it("offers nothing for a short transcript", () => {
      renderDocument(legacy("Hello there."));

      expect(screen.queryByRole("button", offer)).not.toBeInTheDocument();
    });
  });
});
