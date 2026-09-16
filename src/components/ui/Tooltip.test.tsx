import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "./Tooltip";

describe("Tooltip", () => {
  it("shows its content when the trigger gets focus and hides on Escape", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Sep 17, 2:31 PM">
          <button type="button">Created</button>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Sep 17, 2:31 PM",
    );
    expect(screen.getByRole("button", { name: "Created" })).toHaveAttribute(
      "aria-describedby",
    );

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
  });

  it("opens on focus handed back after keyboard use, not after a click", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip content="Copy notes">
          <button type="button">Trigger</button>
        </Tooltip>
        <button type="button">Menu item</button>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });

    // What a menu does when an item is clicked: focus goes back to its trigger.
    await user.click(screen.getByRole("button", { name: "Menu item" }));
    act(() => trigger.focus());
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Menu item" }).focus());
    await user.keyboard("{Enter}");
    act(() => trigger.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy notes");
  });

  it("works without a provider", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Release timeline">
        <button type="button">Span</button>
      </Tooltip>,
    );

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Release timeline",
    );
  });

  it("renders only the trigger when there is no content", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={null}>
        <button type="button">Plain</button>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Plain" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
