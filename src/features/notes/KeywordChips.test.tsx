import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordChips } from "./KeywordChips";

describe("KeywordChips", () => {
  it("lists up to eight keywords", () => {
    const keywords = Array.from({ length: 10 }, (_, i) => `topic ${i + 1}`);
    render(<KeywordChips keywords={keywords} />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(keywords.slice(0, 8));
    expect(screen.getByRole("list", { name: "Keywords" })).toBeVisible();
  });

  it("renders nothing without keywords", () => {
    const { container } = render(<KeywordChips keywords={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("ends a long keyword with an ellipsis", () => {
    const long = "quarterly infrastructure capacity planning review";
    render(<KeywordChips keywords={[long]} />);

    // Ellipsis needs a block-level text box; the chip itself is a flex box.
    const text = screen.getByText(long);
    expect(text).toHaveClass("truncate");
    expect(text.parentElement).toHaveClass("min-w-0");
    expect(text.parentElement).not.toHaveClass("truncate");
  });
});
