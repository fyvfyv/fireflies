import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip } from "./Chip";
import { Kbd } from "./Kbd";
import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";

describe("Skeleton", () => {
  it("is a decorative shimmering block", () => {
    const { container } = render(<Skeleton className="h-4 w-24" />);

    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("animate-shimmer", "h-4", "w-24");
  });
});

describe("Spinner", () => {
  it("is decorative without a label", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-slot", "spinner");
    expect(svg).toHaveClass("animate-spin");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces its label when given one", () => {
    render(<Spinner label="Loading audio" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading audio");
  });
});

describe("Chip", () => {
  it("renders its content", () => {
    render(<Chip>release</Chip>);

    expect(screen.getByText("release")).toHaveClass("bg-sunken");
  });

  it("supports the marker tone", () => {
    render(<Chip tone="marker">due Friday</Chip>);

    expect(screen.getByText("due Friday")).toHaveClass("bg-marker");
  });
});

describe("Kbd", () => {
  it("renders a keyboard key", () => {
    render(
      <p>
        Press <Kbd>Space</Kbd> to play
      </p>,
    );

    const key = screen.getByText("Space");
    expect(key.tagName).toBe("KBD");
  });
});
