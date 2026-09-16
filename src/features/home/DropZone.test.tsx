import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone";

const OVERLAY = "Drop an audio file to transcribe it";

const audio = new File(["x"], "call.m4a", { type: "audio/mp4" });
const text = new File(["x"], "notes.txt", { type: "text/plain" });

// jsdom has no DataTransfer; fireEvent attaches this plain object instead.
const withFiles = (...files: File[]) => ({
  dataTransfer: { types: ["Files"], files, dropEffect: "none" },
});
const withText = () => ({
  dataTransfer: { types: ["text/plain"], files: [], dropEffect: "none" },
});

function setup(props: { disabled?: boolean } = {}) {
  const onSubmit = vi.fn();
  const onReject = vi.fn();
  const view = render(
    <div>
      <button type="button">Target</button>
      <DropZone onSubmit={onSubmit} onReject={onReject} {...props} />
    </div>,
  );
  const target = screen.getByRole("button", { name: "Target" });
  return { ...view, onSubmit, onReject, target };
}

describe("DropZone", () => {
  it("shows an overlay while a file is dragged over the page", () => {
    const { target } = setup();
    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();

    fireEvent.dragEnter(target, withFiles(audio));
    expect(screen.getByText(OVERLAY)).toBeVisible();

    fireEvent.dragLeave(target, withFiles(audio));
    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
  });

  it("stays up while the drag moves between elements", () => {
    const { target } = setup();

    fireEvent.dragEnter(document.body, withFiles(audio));
    fireEvent.dragEnter(target, withFiles(audio));
    fireEvent.dragLeave(document.body, withFiles(audio));
    expect(screen.getByText(OVERLAY)).toBeVisible();

    fireEvent.dragLeave(target, withFiles(audio));
    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
  });

  it("ignores drags that carry no files", () => {
    const { target } = setup();

    fireEvent.dragEnter(target, withText());
    const allowed = fireEvent.dragOver(target, withText());

    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
    expect(allowed).toBe(true);
  });

  it("accepts the drop and submits the file as an upload", () => {
    const { target, onSubmit, onReject } = setup();
    const drag = withFiles(audio);
    fireEvent.dragEnter(target, drag);

    const overNotCancelled = fireEvent.dragOver(target, drag);
    const dropNotCancelled = fireEvent.drop(target, drag);

    // A cancelled dragover is what allows the drop at all.
    expect(overNotCancelled).toBe(false);
    expect(drag.dataTransfer.dropEffect).toBe("copy");
    expect(dropNotCancelled).toBe(false);
    expect(onSubmit).toHaveBeenCalledWith({
      blob: audio,
      contentType: "audio/mp4",
      source: "upload",
    });
    expect(onReject).not.toHaveBeenCalled();
    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
  });

  it("uses the first of several files", () => {
    const { target, onSubmit } = setup();
    const other = new File(["y"], "other.mp3", { type: "audio/mpeg" });

    fireEvent.drop(target, withFiles(audio, other));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ blob: audio }),
    );
  });

  it("rejects a file the upload button would reject, with its message", () => {
    const { target, onSubmit, onReject } = setup();

    fireEvent.drop(target, withFiles(text));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(
      "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
    );
  });

  it("swallows drops while disabled, so the browser can't open the file", () => {
    const { target, onSubmit, onReject } = setup({ disabled: true });
    const drag = withFiles(audio);

    fireEvent.dragEnter(target, drag);
    const overNotCancelled = fireEvent.dragOver(target, drag);
    const dropNotCancelled = fireEvent.drop(target, drag);

    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
    expect(overNotCancelled).toBe(false);
    expect(drag.dataTransfer.dropEffect).toBe("none");
    expect(dropNotCancelled).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it("hides the overlay when it becomes disabled mid-drag", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <DropZone onSubmit={onSubmit} onReject={vi.fn()} />,
    );
    fireEvent.dragEnter(document.body, withFiles(audio));
    expect(screen.getByText(OVERLAY)).toBeVisible();

    rerender(<DropZone onSubmit={onSubmit} onReject={vi.fn()} disabled />);
    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();

    fireEvent.drop(document.body, withFiles(audio));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("forgets elements that went away without a dragleave", () => {
    const { target, rerender, onSubmit, onReject } = setup();
    fireEvent.dragEnter(target, withFiles(audio));
    fireEvent.dragEnter(document.body, withFiles(audio));

    rerender(<DropZone onSubmit={onSubmit} onReject={onReject} />);
    fireEvent.dragLeave(document.body, withFiles(audio));

    expect(screen.queryByText(OVERLAY)).not.toBeInTheDocument();
  });

  it("stops listening on unmount", () => {
    const { unmount, onSubmit } = setup();
    unmount();

    const notCancelled = fireEvent.drop(document.body, withFiles(audio));

    expect(notCancelled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
