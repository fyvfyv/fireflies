import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, LogoMark } from "./Logo";

describe("Logo", () => {
  it("renders the wordmark with a decorative glyph", () => {
    const { container } = render(<Logo />);

    expect(screen.getByText("Recap")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders the glyph alone", () => {
    const { container } = render(<LogoMark className="size-6" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-6");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
