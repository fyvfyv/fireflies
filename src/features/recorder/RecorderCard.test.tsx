import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecorderCard } from "./RecorderCard";
import type { Recorder } from "./useRecorder";

const recording = {
  blob: new Blob(["x"], { type: "audio/webm" }),
  contentType: "audio/webm",
  durationSeconds: 12,
};

function recorderStub(overrides: Partial<Recorder> = {}): Recorder {
  return {
    state: "idle",
    elapsed: 0,
    warning: false,
    result: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

const stopped = () => recorderStub({ state: "stopped", result: recording });

describe("RecorderCard", () => {
  it("starts recording from idle", async () => {
    const recorder = recorderStub();
    const user = userEvent.setup();
    render(<RecorderCard recorder={recorder} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Start recording" }));

    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it("disables start while waiting for permission", () => {
    render(
      <RecorderCard
        recorder={recorderStub({ state: "requesting" })}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeDisabled();
    expect(screen.getByText(/allow microphone access/i)).toBeInTheDocument();
  });

  it("disables start while a file or sample is being saved", () => {
    render(<RecorderCard recorder={recorderStub()} onSubmit={vi.fn()} busy />);

    expect(
      screen.getByRole("button", { name: "Start recording" }),
    ).toBeDisabled();
  });

  it("shows the timer and stops while recording", async () => {
    const recorder = recorderStub({ state: "recording", elapsed: 65 });
    const user = userEvent.setup();
    render(<RecorderCard recorder={recorder} onSubmit={vi.fn()} />);

    expect(screen.getByRole("timer")).toHaveTextContent("01:05");
    expect(
      screen.queryByRole("button", { name: "Start recording" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/stops automatically/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("warns near the recording limit", () => {
    render(
      <RecorderCard
        recorder={recorderStub({
          state: "recording",
          elapsed: 3300,
          warning: true,
        })}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "stops automatically at 60 minutes",
    );
  });

  it("offers save, discard and download after stopping", () => {
    render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} />);

    const title = screen.getByLabelText("Title");
    expect(title).toHaveValue("");
    expect(title).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/^Recording /),
    );
    expect(
      screen.getByRole("button", { name: "Save & transcribe" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
    const download = screen.getByRole("link", { name: "Download recording" });
    expect(download).toHaveAttribute("href", "blob:mock");
    expect(download).toHaveAttribute("download", "recording.webm");
  });

  it("saves without a title so the summary can name it", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save & transcribe" }));

    expect(onSubmit).toHaveBeenCalledWith({
      ...recording,
      title: undefined,
      source: "mic",
    });
  });

  it("saves a typed title trimmed", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "  Planning  {Enter}");

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Planning" }),
    );
  });

  it("treats a blank title as no title", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "   ");
    await user.click(screen.getByRole("button", { name: "Save & transcribe" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: undefined }),
    );
  });

  it("discards through reset, then tells the parent", async () => {
    const recorder = stopped();
    const onDiscard = vi.fn();
    const user = userEvent.setup();
    render(
      <RecorderCard
        recorder={recorder}
        onSubmit={vi.fn()}
        onDiscard={onDiscard}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(recorder.reset).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("revokes the download URL when the review form goes away", () => {
    const { unmount } = render(
      <RecorderCard recorder={stopped()} onSubmit={vi.fn()} />,
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("locks the form while saving", () => {
    render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} busy />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
  });

  it("explains a blocked microphone and points to the alternatives", () => {
    render(
      <RecorderCard
        recorder={recorderStub({ state: "denied" })}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Microphone access is blocked")).toBeVisible();
    expect(screen.getByText("No microphone?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try a sample" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Upload audio file" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Start recording" }),
    ).not.toBeInTheDocument();
  });

  it("explains an unsupported browser and points to the alternatives", () => {
    render(
      <RecorderCard
        recorder={recorderStub({ state: "unsupported" })}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Recording isn't available in this browser"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try a sample" })).toBeVisible();
  });

  it("submits an uploaded file through the alternatives", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RecorderCard
        recorder={recorderStub({ state: "unsupported" })}
        onSubmit={onSubmit}
      />,
    );
    const file = new File(["x"], "call.mp3", { type: "audio/mpeg" });

    await user.upload(screen.getByLabelText("Audio file"), file);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ blob: file, source: "upload" }),
    );
  });

  it("locks the alternatives while saving", () => {
    render(
      <RecorderCard
        recorder={recorderStub({ state: "denied" })}
        onSubmit={vi.fn()}
        busy
      />,
    );

    expect(screen.getByRole("button", { name: "Try a sample" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Upload audio file" }),
    ).toBeDisabled();
  });

  it("lets the user try again when the mic could not start", async () => {
    const recorder = recorderStub({ state: "unavailable" });
    const user = userEvent.setup();
    render(<RecorderCard recorder={recorder} onSubmit={vi.fn()} />);

    expect(screen.getByText("Couldn't start the microphone")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(recorder.start).toHaveBeenCalledTimes(1);
  });

  it("disables trying the mic again while saving", () => {
    render(
      <RecorderCard
        recorder={recorderStub({ state: "unavailable" })}
        onSubmit={vi.fn()}
        busy
      />,
    );

    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });
});
