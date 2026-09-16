import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ErrorAlert } from "./ErrorAlert";

it("announces the message and offers its action", async () => {
  const onClick = vi.fn();
  const user = userEvent.setup();
  render(
    <ErrorAlert
      message="Could not load meetings."
      action={{ label: "Try again", onClick }}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not load meetings.",
  );
  await user.click(screen.getByRole("button", { name: "Try again" }));

  expect(onClick).toHaveBeenCalledOnce();
});
