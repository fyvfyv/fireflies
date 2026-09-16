import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Download } from "lucide-react";
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

  it.each([
    ["primary", "bg-ink"],
    ["secondary", "border-rule"],
    ["ghost", "text-graphite"],
    ["danger", "bg-danger"],
    ["marker", "bg-marker"],
  ] as const)("styles the %s variant", (variant, className) => {
    render(<Button variant={variant}>Styled</Button>);

    expect(screen.getByRole("button", { name: "Styled" })).toHaveClass(
      className,
    );
  });

  it.each([
    ["sm", "h-8"],
    ["md", "h-10"],
    ["lg", "h-12"],
  ] as const)("sizes the %s button", (size, className) => {
    render(<Button size={size}>Sized</Button>);

    expect(screen.getByRole("button", { name: "Sized" })).toHaveClass(
      className,
    );
  });

  it("is not busy by default", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button.querySelector("[data-slot='spinner']")).toBeNull();
  });

  it("shows a spinner and ignores clicks while busy", async () => {
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
    expect(button.querySelector("[data-slot='spinner']")).not.toBeNull();

    // Still focusable, so keyboard users keep their place while it works.
    await user.tab();
    expect(button).toHaveFocus();

    await user.click(button);
    await user.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("marks a busy asChild element without replacing it", () => {
    render(
      <Button asChild busy>
        <a href="/file">Download</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Download" });
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link.querySelector("[data-slot='spinner']")).not.toBeNull();
  });

  it("ignores the child's own click handler while busy", async () => {
    // jsdom can't navigate, so the handler keeps the link from trying.
    const onClick = vi.fn((e: { preventDefault: () => void }) =>
      e.preventDefault(),
    );
    const user = userEvent.setup();
    const { rerender } = render(
      <Button asChild busy>
        <a href="/exports/notes.md" onClick={onClick}>
          Download
        </a>
      </Button>,
    );

    await user.click(screen.getByRole("link", { name: "Download" }));
    expect(onClick).not.toHaveBeenCalled();

    rerender(
      <Button asChild>
        <a href="/exports/notes.md" onClick={onClick}>
          Download
        </a>
      </Button>,
    );
    await user.click(screen.getByRole("link", { name: "Download" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each([false, true])("sizes icons for buttons (asChild: %s)", (asChild) => {
    render(
      <Button asChild={asChild}>
        {asChild ? (
          <a href="/export">
            <Download /> Export
          </a>
        ) : (
          <>
            <Download /> Export
          </>
        )}
      </Button>,
    );

    const svg = screen
      .getByRole(asChild ? "link" : "button", { name: "Export" })
      .querySelector("svg");
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("stroke-width", "1.75");
  });
});
