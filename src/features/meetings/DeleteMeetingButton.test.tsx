import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteMeetingButton } from "./DeleteMeetingButton";

describe("DeleteMeetingButton", () => {
  it("asks for confirmation before deleting", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DeleteMeetingButton onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels back to the trigger", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DeleteMeetingButton onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Confirm delete" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses a custom label and locks while deleting", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DeleteMeetingButton label="Delete and re-upload" onConfirm={vi.fn()} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Delete and re-upload" }),
    );
    rerender(
      <DeleteMeetingButton
        label="Delete and re-upload"
        onConfirm={vi.fn()}
        deleting
      />,
    );

    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
