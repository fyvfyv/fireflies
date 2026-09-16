import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "./Menu";

it("opens from its trigger, fires the chosen item and closes", async () => {
  const onCopy = vi.fn();
  const onDelete = vi.fn();
  const user = userEvent.setup();
  render(
    <Menu>
      <MenuTrigger asChild>
        <button type="button">Actions</button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={onCopy}>Copy notes</MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" onSelect={onDelete}>
          Delete meeting
        </MenuItem>
      </MenuContent>
    </Menu>,
  );

  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Copy notes" }));

  expect(onCopy).toHaveBeenCalledOnce();
  expect(onDelete).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
});
