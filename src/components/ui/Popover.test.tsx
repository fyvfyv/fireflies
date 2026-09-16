import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "./Popover";

it("opens a labelled panel and closes from its close button or Escape", async () => {
  const user = userEvent.setup();
  render(
    <Popover>
      <PopoverTrigger asChild>
        <button type="button">Delete meeting</button>
      </PopoverTrigger>
      <PopoverContent aria-label="Confirm delete">
        <PopoverClose asChild>
          <button type="button">Cancel</button>
        </PopoverClose>
      </PopoverContent>
    </Popover>,
  );
  const trigger = screen.getByRole("button", { name: "Delete meeting" });
  const closed = () =>
    waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  await user.click(trigger);
  expect(
    await screen.findByRole("dialog", { name: "Confirm delete" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await closed();

  await user.click(trigger);
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await closed();
  expect(trigger).toHaveFocus();
});
