import type { Meeting, Summary } from "@shared/schemas";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
// Each test gets its own meeting, so the once-per-meeting reveal is fresh.
function meeting(overrides: Partial<Meeting> = {}) {
  nextId += 1;
  return meetingFixture({ id: `notes-${nextId}`, ...overrides });
}

function renderDocument(value: Meeting = meeting()) {
  const onUpdated = vi.fn();
  const result = render(
    <>
      <NotesDocument meeting={value} onUpdated={onUpdated} />
      <Toaster />
    </>,
  );
  return { ...result, onUpdated, user: userEvent.setup() };
}

const listOf = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

beforeEach(() => {
  vi.mocked(getAudioUrl).mockResolvedValue({
    url: "https://blob.test/a.webm",
    expiresAt: "2026-09-17T13:00:00.000Z",
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("NotesDocument", () => {
  it("renders the overview, keywords and topic sections", () => {
    const { container } = renderDocument();

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
    // The section's own time is a range button; points keep their marks.
    expect(
      timeline.getAllByRole("button", { name: "Play from 0:00" }),
    ).toHaveLength(1);

    const swatches = container.querySelectorAll("[data-slot='topic-swatch']");
    expect(swatches[0]).toHaveClass("bg-topic-1");
    expect(swatches[1]).toHaveClass("bg-topic-2");
  });

  it("lists action items and decisions", () => {
    renderDocument();

    const actions = within(
      screen.getByRole("region", { name: "Action items" }),
    );
    expect(
      actions.getByRole("checkbox", { name: "Tag the release" }),
    ).toBeVisible();
    expect(actions.getByText("Due Friday")).toBeVisible();
    expect(listOf("Decisions")).toEqual(["Ship on Friday"]);
    // Detailed notes already state each takeaway as a timestamped point.
    expect(
      screen.queryByRole("heading", { name: "Key takeaways" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("leaves out empty lists", () => {
    renderDocument(
      meeting({
        summary: {
          ...baseSummary,
          keywords: [],
          actionItems: [],
          decisions: [],
          keyTakeaways: [],
        },
      }),
    );

    expect(
      screen.queryByRole("heading", { name: "Action items" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Decisions" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Key takeaways" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Keywords" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/None captured/)).not.toBeInTheDocument();
  });

  it("notes when the summary covers only part of a long transcript", () => {
    renderDocument(meeting({ transcriptTruncated: true }));

    expect(screen.getByRole("note")).toHaveTextContent(/too long/i);
  });

  it("copies the notes and confirms it", async () => {
    const { user } = renderDocument();
    const button = screen.getByRole("button", { name: "Copy notes" });

    await user.click(button);

    expect(await screen.findByText("Notes copied")).toBeVisible();
    expect(button.querySelector(".lucide-check")).not.toBeNull();
    const copied = await navigator.clipboard.readText();
    expect(copied).toMatch(/^# Weekly sync\n/);
    expect(copied).toContain("### Release timeline (00:00)");
  });

  it("plays the reveal once per meeting", () => {
    const value = meeting();
    const first = renderDocument(value);
    const animated = () =>
      first.container.ownerDocument.querySelectorAll(".animate-reveal").length;
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
    // 100 s long, with sections at 0:00 and 0:40.
    function timed(durationSeconds: number | null = 100) {
      const [first, second] = baseSummary.notes as [
        Summary["notes"][number],
        Summary["notes"][number],
      ];
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

    function renderPlaying(value: Meeting) {
      const result = render(
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
      return { ...result, audio, playTo, user: userEvent.setup() };
    }

    it("shows each section's time range after its heading", () => {
      renderDocument(timed());

      const range = screen.getByRole("button", {
        name: "Play Release timeline, 0:00 to 0:40",
      });
      expect(range).toHaveTextContent(/^0:00–0:40$/);
      expect(range.querySelector(".marker")).toBeNull();
      expect(range).toHaveClass("relative", "pointer-coarse:before:-inset-y-2");
      expect(
        screen.getByRole("button", {
          name: "Play Release tasks, 0:40 to 1:40",
        }),
      ).toBeVisible();

      // Inline with the heading, joined by a no-break space so the time
      // never starts a line on its own.
      const heading = screen.getByRole("heading", { name: "Release timeline" });
      const row = heading.parentElement as HTMLElement;
      expect(row).toHaveClass("max-w-[68ch]");
      expect(row).toContainElement(range);
      expect(row.textContent).toContain(" ");

      const timeline = within(
        screen.getByRole("region", { name: "Release timeline" }),
      );
      expect(
        timeline.getByRole("button", { name: "Play from 0:00" }),
      ).toBeVisible();
    });

    it("shows only the start when the length is unknown", () => {
      renderDocument(timed(null));

      const start = screen.getByRole("button", {
        name: "Play Release timeline, 0:00",
      });
      expect(start).toHaveTextContent(/^0:00$/);
    });

    it("plays a section from its start", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play");
      const { user } = renderPlaying(timed());

      const range = screen.getByRole("button", {
        name: "Play Release tasks, 0:40 to 1:40",
      });
      await user.click(range);
      await act(() => Promise.resolve());

      expect(
        screen.getByRole("status", { name: "Position" }),
      ).toHaveTextContent("40");
      expect(play).toHaveBeenCalledTimes(1);
      // Space should pause next, not replay the section.
      expect(range).not.toHaveFocus();
    });

    it("stretches the playing section's swatch", () => {
      const { container, playTo } = renderPlaying(timed());
      const active = () =>
        [...container.querySelectorAll("[data-slot='topic-swatch']")].map(
          (swatch) => swatch.hasAttribute("data-active"),
        );
      expect(active()).toEqual([false, false]);

      playTo(45);
      expect(active()).toEqual([false, true]);
      const swatches = container.querySelectorAll("[data-slot='topic-swatch']");
      expect(swatches[1]).toHaveClass("h-full");
      expect(swatches[0]).toHaveClass("h-4");

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

    it("keeps the overview and lists, and offers detailed notes", () => {
      renderDocument(legacy("One two three four five six seven."));

      expect(
        screen.getByText("The team agreed to ship the release on Friday."),
      ).toBeVisible();
      expect(listOf("Decisions")).toEqual(["Ship on Friday"]);
      expect(listOf("Key takeaways")).toEqual(["Release is on track"]);
      expect(
        screen.getByRole("button", { name: "Generate detailed notes" }),
      ).toBeVisible();
    });

    it("doesn't offer notes for a transcript too short to summarize", () => {
      renderDocument(legacy("Hello there."));

      expect(
        screen.queryByRole("button", { name: "Generate detailed notes" }),
      ).not.toBeInTheDocument();
    });
  });
});
