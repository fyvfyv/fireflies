import { MAX_AUDIO_BYTES } from "@shared/constants";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadAudioButton, validateAudioFile } from "./UploadAudioButton";

const NOT_AUDIO = "Choose an audio file (WebM, M4A, MP3, WAV or OGG).";

describe("validateAudioFile", () => {
  it.each([
    ["call.m4a", "audio/mp4", "audio/mp4"],
    ["rec.webm", "video/webm", "audio/webm"],
    ["call.wav", "audio/x-wav", "audio/wav"],
    ["call.mp3", "audio/mp3", "audio/mpeg"],
    ["CALL.OGG", "", "audio/ogg"],
  ])("accepts %s reported as %j as %s", (name, type, contentType) => {
    expect(validateAudioFile(new File(["x"], name, { type }))).toEqual({
      ok: true,
      contentType,
    });
  });

  it("explains what is wrong with a file it rejects", () => {
    const big = new File(["x"], "big.mp3", { type: "audio/mpeg" });
    Object.defineProperty(big, "size", { value: MAX_AUDIO_BYTES + 1 });
    const errorFor = (file: File) => {
      const check = validateAudioFile(file);
      return check.ok ? null : check.error;
    };

    expect(errorFor(new File(["x"], "notes.txt", { type: "text/plain" }))).toBe(
      NOT_AUDIO,
    );
    expect(errorFor(new File(["x"], "notes"))).toBe(NOT_AUDIO);
    expect(errorFor(big)).toBe(
      "This file is over 25 MB. Choose a shorter recording.",
    );
    expect(errorFor(new File([], "empty.mp3", { type: "audio/mpeg" }))).toBe(
      "This file is empty.",
    );
  });
});

describe("UploadAudioButton", () => {
  function setup() {
    const onSubmit = vi.fn();
    const onReject = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<UploadAudioButton onSubmit={onSubmit} onReject={onReject} />);
    const input = screen.getByLabelText<HTMLInputElement>("Audio file");
    const pick = vi.fn();
    input.addEventListener("click", pick);
    return { onSubmit, onReject, user, input, pick };
  }

  it("opens the file picker for audio types, but not on a double click", async () => {
    const { user, input, pick } = setup();
    const button = screen.getByRole("button", { name: "Upload audio" });

    fireEvent.click(button, { detail: 2 });
    expect(pick).not.toHaveBeenCalled();

    await user.click(button);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(input.accept).toContain("audio/webm");
    expect(input.accept).toContain(".m4a");
  });

  it("explains a rejected file until a valid one is submitted", async () => {
    const { onSubmit, onReject, user, input } = setup();

    await user.upload(input, new File(["x"], "notes.txt"));

    expect(screen.getByRole("alert")).toHaveTextContent(NOT_AUDIO);
    expect(onReject).toHaveBeenCalledWith(NOT_AUDIO);
    expect(onSubmit).not.toHaveBeenCalled();

    const file = new File(["x"], "call.m4a", { type: "audio/mp4" });
    await user.upload(input, file);

    expect(onSubmit).toHaveBeenCalledWith({
      blob: file,
      contentType: "audio/mp4",
      source: "upload",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
