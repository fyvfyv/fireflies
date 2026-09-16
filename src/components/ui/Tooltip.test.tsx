import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "./Tooltip";

describe("Tooltip", () => {
  it("shows on keyboard focus and hides on Escape, even without a provider", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Sep 17, 2:31 PM">
        <button type="button">Created</button>
      </Tooltip>,
    );

    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Sep 17, 2:31 PM",
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
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
    const menuItem = screen.getByRole("button", { name: "Menu item" });

    await user.click(menuItem);
    act(() => trigger.focus());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => menuItem.focus());
    await user.keyboard("{Enter}");
    act(() => trigger.focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy notes");
  });
});
