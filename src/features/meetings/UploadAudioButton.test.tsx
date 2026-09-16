import { MAX_AUDIO_BYTES } from "@shared/constants";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadAudioButton } from "./UploadAudioButton";

function setup(props: { disabled?: boolean } = {}) {
  const onSubmit = vi.fn();
  // The picker's accept filter would drop invalid files before validation runs.
  const user = userEvent.setup({ applyAccept: false });
  render(<UploadAudioButton onSubmit={onSubmit} {...props} />);
  const upload = (file: File) =>
    user.upload(screen.getByLabelText("Audio file"), file);
  return { onSubmit, user, upload };
}

describe("UploadAudioButton", () => {
  it("opens the file picker for audio types", async () => {
    const { user } = setup();
    const input = screen.getByLabelText<HTMLInputElement>("Audio file");
    const pick = vi.fn();
    input.addEventListener("click", pick);

    await user.click(screen.getByRole("button", { name: "Upload audio file" }));

    expect(pick).toHaveBeenCalledTimes(1);
    expect(input.accept).toContain("audio/webm");
    expect(input.accept).toContain("audio/mpeg");
    expect(input.accept).toContain(".m4a");
  });

  it("rejects a file that is not audio", async () => {
    const { onSubmit, upload } = setup();

    await upload(new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /choose an audio file/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a file over the size limit", async () => {
    const { onSubmit, upload } = setup();
    const big = new File(["x"], "big.m4a", { type: "audio/mp4" });
    Object.defineProperty(big, "size", { value: MAX_AUDIO_BYTES + 1 });

    await upload(big);

    expect(screen.getByRole("alert")).toHaveTextContent("over 25 MB");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    const { onSubmit, upload } = setup();

    await upload(new File([], "empty.mp3", { type: "audio/mpeg" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/empty/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid audio file", async () => {
    const { onSubmit, upload } = setup();
    const file = new File(["x"], "call.m4a", { type: "audio/mp4" });

    await upload(file);

    expect(onSubmit).toHaveBeenCalledWith({
      blob: file,
      contentType: "audio/mp4",
      source: "upload",
      title: undefined,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts a WebM file the browser labels as video", async () => {
    const { onSubmit, upload } = setup();
    const file = new File(["x"], "recording.webm", { type: "video/webm" });

    await upload(file);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ blob: file, contentType: "audio/webm" }),
    );
  });

  it.each([
    ["call.wav", "audio/x-wav", "audio/wav"],
    ["call.wav", "audio/vnd.wave", "audio/wav"],
    ["call.mp3", "audio/mp3", "audio/mpeg"],
    ["call.m4a", "", "audio/mp4"],
    ["CALL.OGG", "", "audio/ogg"],
  ])("uploads %s reported as %j as %s", async (name, type, expected) => {
    const { onSubmit, upload } = setup();
    const file = new File(["x"], name, { type });

    await upload(file);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ blob: file, contentType: expected }),
    );
  });

  it("rejects an untyped file with an unknown extension", async () => {
    const { onSubmit, upload } = setup();

    await upload(new File(["x"], "notes", { type: "" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /choose an audio file/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("clears the error after a valid pick", async () => {
    const { onSubmit, upload } = setup();

    await upload(new File(["x"], "notes.txt", { type: "text/plain" }));
    await upload(new File(["x"], "call.mp3", { type: "audio/mpeg" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can be disabled", () => {
    setup({ disabled: true });

    expect(
      screen.getByRole("button", { name: "Upload audio file" }),
    ).toBeDisabled();
  });
});
