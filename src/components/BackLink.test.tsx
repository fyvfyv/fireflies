import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";
import { BackLink } from "./BackLink";

it("links back to the meetings list", () => {
  render(<BackLink label="Meetings" />, { wrapper: MemoryRouter });

  expect(screen.getByRole("link", { name: "Meetings" })).toHaveAttribute(
    "href",
    "/",
  );
});
