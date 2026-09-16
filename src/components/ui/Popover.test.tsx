import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./Popover";

function renderPopover() {
  render(
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">Delete meeting</button>
      </PopoverTrigger>
      <PopoverContent aria-label="Confirm delete">
        <p>Delete this meeting? This can't be undone.</p>
        <PopoverClose asChild>
          <button type="button">Cancel</button>
        </PopoverClose>
      </PopoverContent>
    </Popover>,
  );
}

describe("Popover", () => {
  it("opens a labelled panel from its trigger", async () => {
    const user = userEvent.setup();
    renderPopover();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete meeting" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Confirm delete",
    });
    expect(dialog).toHaveTextContent("This can't be undone.");
    expect(
      screen.getByRole("button", { name: "Delete meeting" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("closes from a close button and from Escape", async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByRole("button", { name: "Delete meeting" });

    await user.click(trigger);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
