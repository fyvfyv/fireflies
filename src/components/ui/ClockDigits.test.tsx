import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClockDigits } from "./ClockDigits";

describe("ClockDigits", () => {
  it("puts every digit in a fixed-width cell and leaves separators bare", () => {
    const { container } = render(<ClockDigits value="12:05" />);
    const cells = container.querySelectorAll("[data-slot=digit]");
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell).toHaveClass("w-[1ch]");
    expect([...cells].map((cell) => cell.textContent)).toEqual([
      "1",
      "2",
      "0",
      "5",
    ]);
    const visual = container.querySelector("[aria-hidden=true]");
    expect(visual?.textContent).toBe("12:05");
    expect(
      [...(visual?.childNodes ?? [])].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent === ":",
      ),
    ).toBe(true);
  });

  it("gives assistive tech the value once instead of cell by cell", () => {
    const { container } = render(<ClockDigits value="12:05" />);
    const spoken = container.querySelector(".sr-only");
    expect(spoken?.textContent).toBe("12:05");
    expect(container.querySelector("[aria-hidden=true]")).not.toBeNull();
  });

  it("handles hour-long values", () => {
    const { container } = render(<ClockDigits value="1:02:03" />);
    expect(container.querySelectorAll("[data-slot=digit]")).toHaveLength(5);
  });

  it("merges a caller class onto the wrapper", () => {
    const { container } = render(
      <ClockDigits value="0:01" className="text-ink" />,
    );
    expect(container.firstElementChild).toHaveClass(
      "whitespace-nowrap",
      "text-ink",
    );
  });
});
