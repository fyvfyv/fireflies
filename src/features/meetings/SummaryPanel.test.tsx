import type { Summary } from "@shared/schemas";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryPanel } from "./SummaryPanel";

const summary: Summary = {
  title: "Weekly standup",
  overview: "The team reviewed the release and agreed on next steps.",
  keyTakeaways: ["Release is on track", "Two bugs remain"],
  decisions: ["Ship on Friday"],
  actionItems: [
    { task: "Tag the release", owner: "Ana", due: "Friday" },
    { task: "Update the changelog", owner: null, due: null },
  ],
};

const section = (name: string) => screen.getByRole("region", { name });

const actionItems = () =>
  within(screen.getByRole("list", { name: "Action items" })).getAllByRole(
    "listitem",
  ) as [HTMLElement, ...HTMLElement[]];

const listOf = (heading: string) =>
  within(screen.getByRole("list", { name: heading }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("SummaryPanel", () => {
  it("renders the overview, takeaways, decisions and action items", () => {
    render(<SummaryPanel summary={summary} truncated={false} />);

    const panel = section("Summary");
    expect(
      within(panel).getByText(
        "The team reviewed the release and agreed on next steps.",
      ),
    ).toBeVisible();
    expect(listOf("Key takeaways")).toEqual([
      "Release is on track",
      "Two bugs remain",
    ]);
    expect(listOf("Decisions")).toEqual(["Ship on Friday"]);
    expect(actionItems()).toHaveLength(2);
    expect(screen.queryByText("None captured")).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows owner and due chips only when the LLM captured them", () => {
    render(<SummaryPanel summary={summary} truncated={false} />);

    const [assigned, open] = actionItems();
    expect(assigned).toHaveTextContent(/^Tag the release/);
    expect(within(assigned).getByText("Ana")).toBeVisible();
    expect(within(assigned).getByText("Due Friday")).toBeVisible();
    expect(open).toHaveTextContent(/^Update the changelog$/);
  });

  it("says None captured for empty sections", () => {
    render(
      <SummaryPanel
        summary={{
          title: "Empty recording",
          overview: "No discernible speech was found in this recording.",
          keyTakeaways: [],
          decisions: [],
          actionItems: [],
        }}
        truncated={false}
      />,
    );

    expect(screen.getAllByText("None captured")).toHaveLength(3);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("notes when the summary covers only part of a long transcript", () => {
    render(<SummaryPanel summary={summary} truncated />);

    expect(screen.getByRole("note")).toHaveTextContent(/too long/i);
  });

  it("shows a placeholder until the summary exists", () => {
    render(<SummaryPanel summary={null} truncated={false} />);

    expect(section("Summary")).toHaveTextContent(
      "The summary will appear here once processing finishes.",
    );
    expect(screen.queryByText("Key takeaways")).not.toBeInTheDocument();
  });
});
