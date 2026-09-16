import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { ClockDigits } from "./ClockDigits";

it("puts each digit in a fixed-width cell and reads the value once", () => {
  const { container } = render(<ClockDigits value="1:02:05" />);

  const cells = [...container.querySelectorAll("[data-slot=digit]")];
  expect(cells.map((cell) => cell.textContent)).toEqual([
    "1",
    "0",
    "2",
    "0",
    "5",
  ]);
  for (const cell of cells) expect(cell).toHaveClass("w-[1ch]");
  expect(container.querySelector("[aria-hidden=true]")).toHaveTextContent(
    "1:02:05",
  );
  expect(container.querySelector(".sr-only")).toHaveTextContent("1:02:05");
});
