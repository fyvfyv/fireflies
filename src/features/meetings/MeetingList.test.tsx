import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { meetingListItemFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { MeetingList } from "./MeetingList";

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

beforeEach(() => {
  // Only Date, so user-event keeps its real timers.
  vi.useFakeTimers({ now: new Date(2026, 8, 17, 16, 0), toFake: ["Date"] });
});

function renderList(props: Partial<ComponentProps<typeof MeetingList>> = {}) {
  return renderWithRouter(
    <MeetingList meetings={[weekly, design, pricing]} {...props} />,
  );
}

const rowFor = (title: string) =>
  within(
    screen.getByRole("link", { name: title }).closest("li") as HTMLElement,
  );

describe("MeetingList", () => {
  it("groups meeting links under day headings", () => {
    renderList();

    const hrefs = (day: string) =>
      within(screen.getByRole("list", { name: day }))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
    expect(
      screen.getByRole("heading", { level: 2, name: "Meetings" }),
    ).toBeInTheDocument();
    expect(hrefs("Today")).toEqual(["/m/m1", "/m/m2"]);
    expect(hrefs("Yesterday")).toEqual(["/m/m3"]);
  });

  it("names each row by its title and describes the rest", () => {
    renderList();

    expect(
      screen.getByRole("link", { name: "Weekly sync" }),
    ).toHaveAccessibleDescription(
      /The team agreed to ship the release on Friday\. .*2 min.*3 action items.*2:31\sPM.*Done/,
    );
    expect(
      rowFor("Weekly sync").getByText(/2:31/).closest("time"),
    ).toHaveAttribute("datetime", weekly.createdAt);
    const older = rowFor("Pricing call");
    expect(older.getByText("1 action item")).toBeInTheDocument();
    expect(older.getByText("Sep 16")).toBeInTheDocument();
  });

  it("leaves out counts a run hasn't produced yet", () => {
    renderList();

    const row = rowFor("Design review");
    expect(row.getByText("Transcribing")).toBeInTheDocument();
    expect(row.queryByText(/action item/)).not.toBeInTheDocument();
    expect(row.queryByText(/min|\d s$/)).not.toBeInTheDocument();
    expect(row.getByText("Uploaded file")).toBeInTheDocument();
  });

  it("marks an interrupted run", () => {
    renderList({ meetings: [{ ...design, stalled: true }] });

    expect(rowFor("Design review").getByText("Interrupted")).toBeVisible();
  });

  it("relabels the days after midnight", async () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 17, 23, 59, 30) });
    renderList({ meetings: [weekly] });
    expect(screen.getByRole("list", { name: "Today" })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(screen.getByRole("list", { name: "Yesterday" })).toBeInTheDocument();
    expect(rowFor("Weekly sync").getByText("Sep 17")).toBeInTheDocument();
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
      expect(screen.getByRole("link", { name: "Pricing call" })).toBeVisible();
      expect(
        screen.queryByRole("heading", { name: "Today" }),
      ).not.toBeInTheDocument();
    });

    it("says when nothing matches, and recovers when cleared", async () => {
      const user = userEvent.setup();
      renderList();

      await user.type(screen.getByRole("searchbox"), "  roadmap ");

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("No meetings match “roadmap”.")).toBeVisible();

      await user.click(screen.getByRole("button", { name: "Clear search" }));
      expect(screen.getAllByRole("link")).toHaveLength(3);
    });
  });

  it("shows skeleton rows while loading", () => {
    renderList({ meetings: null, loading: true });

    expect(screen.getByText("Loading meetings…")).toBeInTheDocument();
    expect(screen.queryByText("No meetings yet")).not.toBeInTheDocument();
  });

  it("shows nothing but the alert when the first load failed", () => {
    renderList({
      meetings: null,
      alert: <p role="alert">Database unavailable</p>,
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.queryByText("Loading meetings…")).not.toBeInTheDocument();
    expect(screen.queryByText("No meetings yet")).not.toBeInTheDocument();
  });

  it("explains how to start when there are no meetings", () => {
    renderList({
      meetings: [],
      emptyActions: <button type="button">Try it</button>,
    });

    expect(screen.getByText("No meetings yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try it" })).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
