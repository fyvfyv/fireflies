import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteMeetingButton } from "./DeleteMeetingButton";

const trigger = () => screen.getByRole("button", { name: "Delete it" });
const dialog = () =>
  within(screen.getByRole("dialog", { name: "Delete this meeting?" }));

describe("DeleteMeetingButton", () => {
  it("locks while deleting and stays open to show a failure", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DeleteMeetingButton label="Delete it" onConfirm={vi.fn()} />,
    );
    await user.click(trigger());
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "This can't be undone.",
    );

    rerender(
      <DeleteMeetingButton label="Delete it" onConfirm={vi.fn()} deleting />,
    );
    expect(dialog().getByRole("button", { name: "Delete" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(dialog().getByRole("button", { name: "Cancel" })).toBeDisabled();

    rerender(
      <DeleteMeetingButton
        label="Delete it"
        onConfirm={vi.fn()}
        error="Database unavailable"
      />,
    );
    expect(dialog().getByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(
      dialog().getByRole("button", { name: "Delete" }),
    ).not.toHaveAttribute("aria-busy");
  });
});
