import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";

describe("IconButton", () => {
  it("is named by its label, which the tooltip shows without repeating it as a description", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton label="Copy link" onClick={onClick}>
        <Link2 />
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Copy link" });
    expect(button).toHaveAttribute("type", "button");
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy link");
    expect(button).not.toHaveAttribute("aria-describedby");

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("uses a custom tooltip as the description", async () => {
    const user = userEvent.setup();
    render(
      <IconButton label="Share" tooltip="Anyone with the link can view">
        <Link2 />
      </IconButton>,
    );

    await user.tab();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Share" }),
      ).toHaveAccessibleDescription("Anyone with the link can view"),
    );
  });

  it("can skip the tooltip", async () => {
    const user = userEvent.setup();
    render(
      <IconButton label="Close" tooltip={false}>
        <Link2 />
      </IconButton>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("works as a menu trigger without a tooltip popping up after a pick", async () => {
    const user = userEvent.setup();
    render(
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More actions">
            <Link2 />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem>Copy notes</MenuItem>
        </MenuContent>
      </Menu>,
    );
    const trigger = screen.getByRole("button", { name: "More actions" });

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(
      await screen.findByRole("menuitem", { name: "Copy notes" }),
    );

    await waitFor(() => expect(trigger).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
