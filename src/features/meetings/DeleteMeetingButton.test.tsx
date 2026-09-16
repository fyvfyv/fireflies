import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeleteMeetingButton } from "./DeleteMeetingButton";

const dialog = () =>
  screen.getByRole("dialog", { name: "Delete this meeting?" });

describe("DeleteMeetingButton", () => {
  it("asks for confirmation before deleting", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DeleteMeetingButton onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete meeting" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(dialog()).toHaveAccessibleDescription("This can't be undone.");
    await waitFor(() =>
      expect(
        within(dialog()).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );

    await user.click(within(dialog()).getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels back to the trigger", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<DeleteMeetingButton onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete meeting" }));
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Delete meeting" }),
    ).toHaveFocus();
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

    expect(
      within(dialog()).getByRole("button", { name: "Delete" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      within(dialog()).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
  });

  it("keeps the confirmation open to show a failed delete", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeleteMeetingButton onConfirm={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Delete meeting" }));
    rerender(
      <DeleteMeetingButton onConfirm={vi.fn()} error="Database unavailable" />,
    );

    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(
      within(dialog()).getByRole("button", { name: "Delete" }),
    ).toBeEnabled();
  });
});
