import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MicFreeOptions } from "./MicFreeOptions";

describe("MicFreeOptions", () => {
  it("offers the sample and an upload under an optional label", () => {
    const { rerender } = render(<MicFreeOptions onSubmit={vi.fn()} />);

    expect(screen.getByText("No microphone?")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload audio" })).toBeEnabled();

    rerender(<MicFreeOptions onSubmit={vi.fn()} label={null} />);
    expect(screen.queryByText("No microphone?")).not.toBeInTheDocument();
  });

  it("disables both options", () => {
    render(<MicFreeOptions onSubmit={vi.fn()} disabled />);

    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload audio" })).toBeDisabled();
  });
});
