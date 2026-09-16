import type { ActionItem } from "@shared/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ActionItems } from "./ActionItems";

const items: ActionItem[] = [
  { task: "Send the invite", owner: null, due: "today", startSecond: 85 },
  {
    task: "Write retry tests",
    owner: "Daniel",
    due: "Friday",
    startSecond: 51,
  },
  { task: "Rewrite onboarding", owner: "Ana", due: null, startSecond: null },
];

const group = (owner: string) =>
  within(screen.getByRole("region", { name: owner }));

afterEach(() => {
  localStorage.clear();
});

describe("ActionItems", () => {
  it("groups items by owner, unassigned last, with due dates and moments", () => {
    render(<ActionItems meetingId="m1" items={items} headingLevel={2} />);

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Ana", "Daniel", "Unassigned"]);
    expect(group("Unassigned").getByText("Send the invite")).toBeVisible();
    expect(group("Daniel").getByText("Due Friday")).toBeVisible();
    expect(
      group("Daniel").getByRole("button", { name: "Play from 0:51" }),
    ).toBeVisible();
    expect(group("Ana").queryByText(/^Due/)).not.toBeInTheDocument();
    expect(group("Ana").queryByRole("button")).not.toBeInTheDocument();
  });

  it("checks items off and remembers them for the meeting", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ActionItems meetingId="m1" items={items} />);

    await user.click(screen.getByText("Write retry tests"));
    expect(
      screen.getByRole("checkbox", { name: "Write retry tests" }),
    ).toBeChecked();
    unmount();

    render(<ActionItems meetingId="m1" items={items} />);
    expect(
      screen.getByRole("checkbox", { name: "Write retry tests" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Send the invite" }),
    ).not.toBeChecked();
  });

  it("says so when there are no items", () => {
    render(<ActionItems meetingId="m1" items={[]} />);

    expect(screen.getByText("No action items were mentioned.")).toBeVisible();
  });
});
