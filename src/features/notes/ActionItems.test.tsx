import type { ActionItem } from "@shared/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ActionItems } from "./ActionItems";
import { KeywordChips } from "./KeywordChips";

const items: ActionItem[] = [
  { task: "Send the invite", owner: null, due: "today", startSecond: 85 },
  {
    task: "Write retry tests",
    owner: "Daniel",
    due: "Friday",
    startSecond: 51,
  },
  {
    task: "Rewrite onboarding copy",
    owner: "Ana",
    due: null,
    startSecond: null,
  },
];

afterEach(() => {
  localStorage.clear();
});

const group = (owner: string) => screen.getByRole("region", { name: owner });

describe("ActionItems", () => {
  it("groups items by owner, unassigned last", () => {
    render(<ActionItems meetingId="m1" items={items} />);

    expect(
      screen.getAllByRole("heading").map((heading) => heading.textContent),
    ).toEqual(["Ana", "Daniel", "Unassigned"]);
    expect(
      within(group("Daniel")).getByText("Write retry tests"),
    ).toBeVisible();
    expect(
      within(group("Unassigned")).getByText("Send the invite"),
    ).toBeVisible();
  });

  it("shows due dates and moments only when captured", () => {
    render(<ActionItems meetingId="m1" items={items} />);

    const daniel = within(group("Daniel"));
    expect(daniel.getByText("Due Friday")).toBeVisible();
    expect(
      daniel.getByRole("button", { name: "Play from 0:51" }),
    ).toBeVisible();

    const ana = within(group("Ana"));
    expect(ana.queryByText(/^Due/)).not.toBeInTheDocument();
    expect(ana.queryByRole("button")).not.toBeInTheDocument();
  });

  it("checks items off and remembers them for the meeting", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ActionItems meetingId="m1" items={items} />);

    const box = screen.getByRole("checkbox", { name: "Write retry tests" });
    expect(box).not.toBeChecked();
    await user.click(screen.getByText("Write retry tests"));

    expect(box).toBeChecked();
    const label = screen.getByText("Write retry tests");
    expect(label).toHaveClass("line-through", "text-graphite");
    expect(label).not.toHaveClass("text-faint");
    expect(within(group("Daniel")).getByText("Due Friday")).not.toHaveClass(
      "opacity-60",
    );
    unmount();

    render(<ActionItems meetingId="m1" items={items} />);
    expect(
      screen.getByRole("checkbox", { name: "Write retry tests" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Send the invite" }),
    ).not.toBeChecked();
  });

  it("takes the heading level of its surroundings", () => {
    const { rerender } = render(<ActionItems meetingId="m1" items={items} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);

    rerender(<ActionItems meetingId="m1" items={items} headingLevel={2} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
  });

  it("says so when there are no items", () => {
    render(<ActionItems meetingId="m1" items={[]} />);

    expect(screen.getByText("No action items were mentioned.")).toBeVisible();
  });
});

describe("KeywordChips", () => {
  it("lists up to eight keywords", () => {
    render(
      <KeywordChips keywords={["a", "b", "c", "d", "e", "f", "g", "h", "i"]} />,
    );

    const list = screen.getByRole("list", { name: "Keywords" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
  });

  it("renders nothing without keywords", () => {
    const { container } = render(<KeywordChips keywords={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
