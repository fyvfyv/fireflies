import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordChips } from "./KeywordChips";

describe("KeywordChips", () => {
  it("lists up to eight keywords", () => {
    const keywords = Array.from({ length: 10 }, (_, i) => `topic ${i + 1}`);
    render(<KeywordChips keywords={keywords} />);

    const list = screen.getByRole("list", { name: "Keywords" });
    expect(list).toHaveTextContent(keywords.slice(0, 8).join(""));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });
});
