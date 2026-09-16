import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { BackLink } from "./BackLink";

describe("BackLink", () => {
  it("links back to the meetings list", () => {
    render(<BackLink />, { wrapper: MemoryRouter });

    const link = screen.getByRole("link", { name: "All meetings" });
    expect(link).toHaveAttribute("href", "/");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(link).not.toHaveTextContent("←");
  });

  it("accepts a label and destination", () => {
    render(<BackLink to="/archive" label="Meetings" />, {
      wrapper: MemoryRouter,
    });

    expect(screen.getByRole("link", { name: "Meetings" })).toHaveAttribute(
      "href",
      "/archive",
    );
  });
});
