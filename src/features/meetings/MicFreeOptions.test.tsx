import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MicFreeOptions } from "./MicFreeOptions";

describe("MicFreeOptions", () => {
  it("offers the sample and an upload under a short label", () => {
    render(<MicFreeOptions onSubmit={vi.fn()} />);

    expect(screen.getByText("No microphone?")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload audio" })).toBeEnabled();
  });

  it("can drop the label where the context already explains the options", () => {
    render(<MicFreeOptions onSubmit={vi.fn()} label={null} />);

    expect(screen.queryByText("No microphone?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload audio" })).toBeVisible();
  });

  it("reports a rejected file", async () => {
    const onReject = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<MicFreeOptions onSubmit={vi.fn()} onReject={onReject} />);

    await user.upload(
      screen.getByLabelText("Audio file"),
      new File(["x"], "notes.txt", { type: "text/plain" }),
    );

    expect(onReject).toHaveBeenCalledWith(
      "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
    );
  });

  it("disables both options", () => {
    render(<MicFreeOptions onSubmit={vi.fn()} disabled />);

    expect(
      screen.getByRole("button", { name: "Try a 2-minute sample" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload audio" })).toBeDisabled();
  });
});
