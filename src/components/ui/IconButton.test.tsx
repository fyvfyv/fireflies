import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link2, Play } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "./Menu";

describe("IconButton", () => {
  it("is named by its label and shows it as a tooltip", async () => {
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

    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
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

  it("hides its icon from assistive tech", () => {
    render(
      <IconButton label="Copy link">
        <Link2 />
      </IconButton>,
    );

    expect(
      screen.getByRole("button", { name: "Copy link" }).querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
  });

  it("does not repeat its label as a description", async () => {
    const user = userEvent.setup();
    render(
      <>
        <IconButton label="Copy link">
          <Link2 />
        </IconButton>
        <IconButton label="Share" tooltip="Anyone with the link can view">
          <Link2 />
        </IconButton>
      </>,
    );

    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copy link");
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).not.toHaveAttribute("aria-describedby");

    // A tooltip that says something else still describes the button.
    await user.tab();
    const share = screen.getByRole("button", { name: "Share" });
    await waitFor(() =>
      expect(share).toHaveAccessibleDescription(
        "Anyone with the link can view",
      ),
    );
  });

  it("shows a spinner and ignores clicks while busy", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <IconButton label="Play" busy onClick={onClick}>
        <Play />
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Play" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.querySelector("[data-slot='spinner']")).not.toBeNull();
    expect(button.querySelector(".lucide-play")).toBeNull();

    // Still focusable, so keyboard users keep their place while it works.
    await user.tab();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("works as a menu trigger", async () => {
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
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await user.click(trigger);

    expect(
      await screen.findByRole("menuitem", { name: "Copy notes" }),
    ).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("menuitem", { name: "Copy notes" }));

    // Focus comes back to the trigger, but a pointer user doesn't need its
    // tooltip popping up after picking an item.
    await waitFor(() => expect(trigger).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
