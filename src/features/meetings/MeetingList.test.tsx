import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { meetingListItemFixture } from "@/test/fixtures";
import { renderWithRouter } from "@/test/router";
import { MeetingList } from "./MeetingList";

describe("MeetingList", () => {
  it("renders a row per meeting linking to its page", () => {
    renderWithRouter(
      <MeetingList
        meetings={[
          meetingListItemFixture({ id: "m1", title: "Weekly sync" }),
          meetingListItemFixture({
            id: "m2",
            title: "Design review",
            status: "transcribing",
            source: "upload",
            overviewSnippet: null,
            actionItemCount: 0,
          }),
        ]}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    const first = within(rows[0] as HTMLElement);
    expect(first.getByRole("link", { name: /Weekly sync/ })).toHaveAttribute(
      "href",
      "/m/m1",
    );
    expect(first.getByText("Done")).toBeInTheDocument();
    expect(
      first.getByText("The team agreed to ship the release on Friday."),
    ).toBeInTheDocument();
    expect(first.getByText("3 action items")).toBeInTheDocument();
    expect(first.getByText("Microphone")).toBeInTheDocument();
    expect(first.getByText("2 min")).toBeInTheDocument();

    const second = within(rows[1] as HTMLElement);
    expect(second.getByRole("link", { name: /Design review/ })).toHaveAttribute(
      "href",
      "/m/m2",
    );
    expect(second.getByText("Transcribing")).toBeInTheDocument();
    expect(second.getByText("Uploaded file")).toBeInTheDocument();
    expect(second.queryByText(/action item/)).not.toBeInTheDocument();
  });

  it("uses the singular for one action item", () => {
    renderWithRouter(
      <MeetingList
        meetings={[meetingListItemFixture({ actionItemCount: 1 })]}
      />,
    );

    expect(screen.getByText("1 action item")).toBeInTheDocument();
  });

  it("marks an interrupted run", () => {
    renderWithRouter(
      <MeetingList
        meetings={[
          meetingListItemFixture({ status: "summarizing", stalled: true }),
        ]}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
  });

  it("shows how long ago a meeting was created", () => {
    renderWithRouter(
      <MeetingList
        meetings={[
          meetingListItemFixture({ createdAt: new Date().toISOString() }),
        ]}
      />,
    );

    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("explains the three ways to start when empty", () => {
    renderWithRouter(<MeetingList meetings={[]} />);

    expect(screen.getByText("No meetings yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const ways = within(screen.getByRole("list", { name: "Ways to start" }));
    expect(ways.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Record"),
      expect.stringContaining("Try a sample"),
      expect.stringContaining("Upload audio"),
    ]);
  });
});
