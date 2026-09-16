import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { topicFor } from "@/features/home/meetingGroups";
import { useToday } from "@/features/home/useToday";
import { meetingListItemFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { MeetingList } from "./MeetingList";

vi.mock("@/features/home/useToday", () => ({
  useToday: vi.fn(() => new Date()),
}));

beforeEach(() => {
  vi.mocked(useToday).mockReset();
});

const now = new Date(2026, 8, 17, 16, 0);
const today = (hours: number, minutes = 0) =>
  new Date(2026, 8, 17, hours, minutes).toISOString();

const weekly = meetingListItemFixture({
  id: "m1",
  title: "Weekly sync",
  createdAt: today(14, 31),
});
const design = meetingListItemFixture({
  id: "m2",
  title: "Design review",
  status: "transcribing",
  source: "upload",
  durationSeconds: null,
  overviewSnippet: null,
  actionItemCount: 0,
  createdAt: today(9, 5),
});
const pricing = meetingListItemFixture({
  id: "m3",
  title: "Pricing call",
  overviewSnippet: "Annual plans get a discount.",
  actionItemCount: 1,
  createdAt: new Date(2026, 8, 16, 11, 0).toISOString(),
});

function renderList(props: Partial<Parameters<typeof MeetingList>[0]> = {}) {
  return renderWithRouter(
    <MeetingList meetings={[weekly, design, pricing]} now={now} {...props} />,
  );
}

const rowFor = (title: string) => {
  const link = screen.getByRole("link", { name: title });
  return within(link.closest("li") as HTMLElement);
};

describe("MeetingList", () => {
  it("is a labelled section with a heading", () => {
    renderList();

    expect(
      screen.getByRole("region", { name: "Meetings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Meetings" }),
    ).toBeInTheDocument();
  });

  it("groups meetings by day under headings", () => {
    renderList();

    const today = screen.getByRole("list", { name: "Today" });
    const yesterday = screen.getByRole("list", { name: "Yesterday" });
    expect(
      within(today)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/m/m1", "/m/m2"]);
    expect(within(yesterday).getByRole("link")).toHaveAttribute(
      "href",
      "/m/m3",
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Today" }),
    ).toBeInTheDocument();
  });

  it("names each row link by its title and describes the rest", () => {
    renderList();

    const link = screen.getByRole("link", { name: "Weekly sync" });
    expect(link).toHaveAccessibleDescription(
      /The team agreed to ship the release on Friday\. .*2 min.*3 action items.*2:31\sPM.*Done/,
    );
  });

  it("shows the snippet, duration, action items, time and status", () => {
    renderList();

    const row = rowFor("Weekly sync");
    expect(
      row.getByText("The team agreed to ship the release on Friday."),
    ).toBeInTheDocument();
    expect(row.getByText("2 min")).toBeInTheDocument();
    expect(row.getByText("3 action items")).toBeInTheDocument();
    expect(row.getByText("2:31 PM")).toBeInTheDocument();
    expect(row.getByText("Done")).toHaveClass("sr-only");
    // Proportional digits: Mona Sans's tabular set has a slashed zero.
    expect(row.getByText("2 min").closest(".tabular-nums")).toBeNull();
    expect(row.getByText("2:31 PM").closest("time")).toHaveAttribute(
      "datetime",
      weekly.createdAt,
    );
  });

  it("follows the day change when no date is pinned", () => {
    vi.mocked(useToday).mockReturnValue(new Date(2026, 8, 17, 23, 59));
    const { unmount } = renderWithRouter(<MeetingList meetings={[weekly]} />);
    expect(screen.getByRole("list", { name: "Today" })).toBeInTheDocument();
    expect(rowFor("Weekly sync").getByText(/2:31/)).toBeInTheDocument();
    unmount();

    // The hook hands out a new date once the local day changes.
    vi.mocked(useToday).mockReturnValue(new Date(2026, 8, 18, 0, 0));
    renderWithRouter(<MeetingList meetings={[weekly]} />);

    expect(screen.getByRole("list", { name: "Yesterday" })).toBeInTheDocument();
    expect(rowFor("Weekly sync").getByText("Sep 17")).toBeInTheDocument();
  });

  it("shows a date instead of a time for older days", () => {
    renderList();

    expect(rowFor("Pricing call").getByText("Sep 16")).toBeInTheDocument();
  });

  it("uses the singular for one action item", () => {
    renderList();

    expect(
      rowFor("Pricing call").getByText("1 action item"),
    ).toBeInTheDocument();
  });

  it("leaves out counts a run hasn't produced yet", () => {
    renderList();

    const row = rowFor("Design review");
    expect(row.getByText("Transcribing")).toBeInTheDocument();
    expect(row.queryByText(/action item/)).not.toBeInTheDocument();
    expect(row.queryByText(/min|\d s$/)).not.toBeInTheDocument();
    // Without an overview, the source stands in for the snippet.
    expect(row.getByText("Uploaded file")).toBeInTheDocument();
  });

  it("keeps meaningful meta text at readable contrast", () => {
    renderList({
      meetings: [
        design,
        meetingListItemFixture({
          id: "m4",
          title: "Quiet call",
          actionItemCount: 0,
          createdAt: today(8, 0),
        }),
      ],
    });

    // `faint` is below 4.5:1 on the sheet; it is kept for placeholders.
    expect(rowFor("Design review").getByText("Uploaded file")).toHaveClass(
      "text-graphite",
    );
    const zero = rowFor("Quiet call").getByText("0 action items");
    expect(zero.closest(".text-faint")).toBeNull();
  });

  it("says the notes are being written while a run summarizes", () => {
    renderList({
      meetings: [
        meetingListItemFixture({
          id: "m5",
          title: "Roadmap",
          status: "summarizing",
          actionItemCount: 0,
        }),
      ],
    });

    const row = rowFor("Roadmap");
    expect(row.getByText("Writing notes")).toBeVisible();
    expect(row.queryByText("Summarizing")).not.toBeInTheDocument();
  });

  it("puts the status before the numbers on wide screens", () => {
    renderList();

    // The time anchors the right edge, so a done row's quiet check doesn't
    // leave a gap after it.
    const link = screen.getByRole("link", { name: "Weekly sync" });
    expect(link).toHaveClass(
      "md:grid-cols-[auto_minmax(0,1fr)_7.5rem_4.5rem_3.5rem_5.75rem]",
    );
    const status = rowFor("Weekly sync").getByText("Done").closest("[id]");
    expect(status).toHaveClass("md:col-start-3", "md:justify-end");
    expect(status).not.toHaveClass("md:col-start-6");
  });

  it("marks an interrupted run", () => {
    renderList({
      meetings: [
        meetingListItemFixture({ status: "summarizing", stalled: true }),
      ],
    });

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
  });

  it("gives each meeting its own topic swatch", () => {
    renderList();

    const link = screen.getByRole("link", { name: "Weekly sync" });
    expect(link.querySelector('[data-slot="swatch"]')).toHaveClass(
      `bg-topic-${topicFor("m1")}`,
    );
  });

  describe("search", () => {
    it("filters by title and snippet", async () => {
      const user = userEvent.setup();
      renderList();

      await user.type(
        screen.getByRole("searchbox", { name: "Search meetings" }),
        "ANNUAL",
      );

      expect(screen.getAllByRole("link")).toHaveLength(1);
      expect(
        screen.getByRole("link", { name: "Pricing call" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Today" }),
      ).not.toBeInTheDocument();
    });

    it("says when nothing matches, and recovers when cleared", async () => {
      const user = userEvent.setup();
      renderList();
      const search = screen.getByRole("searchbox", { name: "Search meetings" });

      await user.type(search, "  roadmap ");

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("No meetings match “roadmap”.")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Clear search" }));
      expect(screen.getAllByRole("link")).toHaveLength(3);
    });

    it("is hidden while there is nothing to search", () => {
      renderList({ meetings: [] });

      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });
  });

  it("shows skeleton rows while loading", () => {
    const { container } = renderList({ meetings: null, loading: true });

    const body = container.querySelector('[aria-busy="true"]');
    expect(body).toHaveTextContent("Loading meetings…");
    expect(body?.querySelectorAll('[data-slot="skeleton-row"]')).toHaveLength(
      3,
    );
    expect(screen.queryByText("No meetings yet")).not.toBeInTheDocument();
  });

  it("shows nothing but the alert when the first load failed", () => {
    const { container } = renderList({
      meetings: null,
      alert: <p role="alert">Database unavailable</p>,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByText("No meetings yet")).not.toBeInTheDocument();
  });

  it("explains how to start when there are no meetings", () => {
    renderList({
      meetings: [],
      emptyActions: <button type="button">Try it</button>,
    });

    expect(screen.getByText("No meetings yet")).toBeVisible();
    expect(
      screen.getByText(/Record one above, or start without a microphone/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try it" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
