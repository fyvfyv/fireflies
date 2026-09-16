import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("does not submit forms unless asked to", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Plain" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("lets callers override conflicting classes", () => {
    render(<Button className="px-8">Wide</Button>);

    const button = screen.getByRole("button", { name: "Wide" });
    expect(button).toHaveClass("px-8");
    expect(button).not.toHaveClass("px-4");
  });

  it("renders its child element when asChild is set", () => {
    render(
      <Button asChild variant="secondary">
        <a href="/somewhere">Go</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("href", "/somewhere");
    expect(link).not.toHaveAttribute("type");
    expect(link).toHaveClass("px-4");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
