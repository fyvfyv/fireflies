import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorAlert } from "./ErrorAlert";

describe("ErrorAlert", () => {
  it("announces the message", () => {
    render(<ErrorAlert message="Could not load meetings." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load meetings.");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers its action", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorAlert
        message="Could not load meetings."
        action={{ label: "Try again", onClick }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
