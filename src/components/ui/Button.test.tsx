import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Download } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("does not submit forms unless asked to", async () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("renders its child element with sized icons when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/export">
          <Download /> Export
        </a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Export" });
    expect(link).toHaveAttribute("href", "/export");
    expect(link).not.toHaveAttribute("type");
    expect(link.querySelector("svg")).toHaveAttribute("width", "18");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a spinner and ignores activation while busy, but stays focusable", async () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy onClick={onClick}>
          Uploading audio…
        </Button>
      </form>,
    );

    const button = screen.getByRole("button", { name: "Uploading audio…" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.querySelector("[data-slot='spinner']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.tab();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
