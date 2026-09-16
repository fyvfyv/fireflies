import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

const OVERLAY = "Drop an audio file to transcribe it";

const audio = new File(["x"], "call.m4a", { type: "audio/mp4" });

// jsdom has no DataTransfer; fireEvent attaches this plain object instead.
const withFiles = (...files: File[]) => ({
  dataTransfer: { types: ["Files"], files, dropEffect: "none" },
});

function setup() {
  const onSubmit = vi.fn();
  const onReject = vi.fn();
  const zone = (disabled: boolean) => (
    <div>
      <button type="button">Target</button>
      <DropZone onSubmit={onSubmit} onReject={onReject} disabled={disabled} />
    </div>
  );
  const view = render(zone(false));
  return {
    ...view,
    onSubmit,
    onReject,
    target: screen.getByRole("button", { name: "Target" }),
    setDisabled: (next: boolean) => view.rerender(zone(next)),
  };
}

const overlay = () => screen.queryByText(OVERLAY);

describe("DropZone", () => {
  it("shows an overlay until the drag has left every element it entered", () => {
    const { target } = setup();
    expect(overlay()).not.toBeInTheDocument();

    fireEvent.dragEnter(document.body, withFiles(audio));
    fireEvent.dragEnter(target, withFiles(audio));
    expect(overlay()).toBeVisible();
    fireEvent.dragLeave(document.body, withFiles(audio));
    expect(overlay()).toBeVisible();

    fireEvent.dragLeave(target, withFiles(audio));
    expect(overlay()).not.toBeInTheDocument();
  });

  it("forgets elements that went away without a dragleave", () => {
    const { target } = setup();
    fireEvent.dragEnter(target, withFiles(audio));
    fireEvent.dragEnter(document.body, withFiles(audio));

    target.remove();
    fireEvent.dragLeave(document.body, withFiles(audio));

    expect(overlay()).not.toBeInTheDocument();
  });

  it("ignores drags that carry no files", () => {
    const { target } = setup();
    const text = {
      dataTransfer: { types: ["text/plain"], files: [], dropEffect: "none" },
    };

    fireEvent.dragEnter(target, text);
    const notCancelled = fireEvent.dragOver(target, text);

    expect(overlay()).not.toBeInTheDocument();
    expect(notCancelled).toBe(true);
  });

  it("submits the first dropped file as an upload", () => {
    const { target, onSubmit, onReject } = setup();
    const other = new File(["y"], "other.mp3", { type: "audio/mpeg" });
    const drag = withFiles(audio, other);
    fireEvent.dragEnter(target, drag);

    expect(fireEvent.dragOver(target, drag)).toBe(false);
    expect(drag.dataTransfer.dropEffect).toBe("copy");
    expect(fireEvent.drop(target, drag)).toBe(false);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      blob: audio,
      contentType: "audio/mp4",
      source: "upload",
    });
    expect(onReject).not.toHaveBeenCalled();
    expect(overlay()).not.toBeInTheDocument();
  });

  it("rejects a file the upload button would reject, with its message", () => {
    const { target, onSubmit, onReject } = setup();

    fireEvent.drop(target, withFiles(new File(["x"], "notes.txt")));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(
      "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
    );
  });

  it("swallows drops while disabled, so the browser can't open the file", () => {
    const { target, onSubmit, onReject, setDisabled } = setup();
    const drag = withFiles(audio);
    fireEvent.dragEnter(target, drag);
    expect(overlay()).toBeVisible();

    setDisabled(true);

    expect(overlay()).not.toBeInTheDocument();
    expect(fireEvent.dragOver(target, drag)).toBe(false);
    expect(drag.dataTransfer.dropEffect).toBe("none");
    expect(fireEvent.drop(target, drag)).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it("stops listening on unmount", () => {
    const { unmount, onSubmit } = setup();
    unmount();

    expect(fireEvent.drop(document.body, withFiles(audio))).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
