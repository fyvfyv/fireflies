import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./Menu";

function renderMenu(onCopy = vi.fn(), onDelete = vi.fn()) {
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
  return { onCopy, onDelete };
}

describe("Menu", () => {
  it("opens from its trigger and fires the chosen item", async () => {
    const user = userEvent.setup();
    const { onCopy, onDelete } = renderMenu();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("separator")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Copy notes" }));

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("is keyboard operable", async () => {
    const user = userEvent.setup();
    const { onDelete } = renderMenu();

    screen.getByRole("button", { name: "Actions" }).focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Copy notes" }),
      ).toHaveFocus(),
    );

    await user.keyboard("{ArrowDown}{Enter}");

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("colors danger items", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(
      await screen.findByRole("menuitem", { name: "Delete meeting" }),
    ).toHaveClass("text-danger");
    expect(
      screen.getByRole("menuitem", { name: "Copy notes" }),
    ).not.toHaveClass("text-danger");
  });

  it("rings the highlighted item for keyboard users", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Actions</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem>Copy notes</MenuItem>
          <MenuRadioGroup value="1">
            <MenuRadioItem value="1">1×</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));

    const item = await screen.findByRole("menuitem", { name: "Copy notes" });
    expect(item.className).toContain("focus-visible:outline-ink");
    // `outline-none` sets the outline style to none; the ring must restore it.
    expect(item).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:outline-solid",
    );
    expect(item).toHaveClass("data-highlighted:bg-sunken");
    expect(
      screen.getByRole("menuitemradio", { name: "1×" }).className,
    ).toContain("focus-visible:outline-ink");
  });

  it("offers a single choice with radio items", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger asChild>
          <button type="button">Speed</button>
        </MenuTrigger>
        <MenuContent>
          <MenuRadioGroup value="1" onValueChange={onValueChange}>
            <MenuRadioItem value="1">1×</MenuRadioItem>
            <MenuRadioItem value="1.5">1.5×</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>,
    );

    await user.click(screen.getByRole("button", { name: "Speed" }));

    expect(
      await screen.findByRole("menuitemradio", { name: "1×" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "1.5×" }));
    expect(onValueChange).toHaveBeenCalledWith("1.5");
  });
});
