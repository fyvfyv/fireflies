import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { createAudioAnalyser } from "./audioAnalyser";
import { RecorderCard } from "./RecorderCard";
import type { Recorder } from "./useRecorder";

vi.mock("./audioAnalyser", () => ({ createAudioAnalyser: vi.fn() }));

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
    stream: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

const stopped = () =>
  recorderStub({ state: "stopped", elapsed: 12, result: recording });

type Props = Partial<ComponentProps<typeof RecorderCard>>;

function renderCard(props: Props = {}) {
  const onSubmit = vi.fn();
  const card = (next: Props) => (
    <RecorderCard recorder={recorderStub()} onSubmit={onSubmit} {...next} />
  );
  const view = render(card(props));
  return {
    ...view,
    onSubmit,
    rerender: (next: Props) => view.rerender(card(next)),
  };
}

const button = (name: string) => screen.getByRole("button", { name });
const timer = () => screen.getByRole("timer", { name: "Elapsed time" });

describe("RecorderCard", () => {
  it("tells the parent, then starts recording", async () => {
    const recorder = recorderStub();
    const onStart = vi.fn();
    renderCard({ recorder, onStart });
    expect(screen.getByText("Ready")).toBeVisible();
    expect(timer()).toHaveTextContent("00:00");

    await userEvent.click(button("Start recording"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(recorder.start).toHaveBeenCalledTimes(1);
    expect(onStart.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recorder.start).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("can't start while a file or sample is being saved", () => {
    renderCard({ busy: true });

    expect(button("Start recording")).toBeDisabled();
  });

  it("waits for microphone permission with a busy button", async () => {
    const recorder = recorderStub({ state: "requesting" });
    renderCard({ recorder });

    await userEvent.click(button("Waiting for microphone…"));

    expect(button("Waiting for microphone…")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(recorder.start).not.toHaveBeenCalled();
    expect(screen.getByText(/allow microphone access/i)).toBeVisible();
  });

  it("shows the running timer and stops on a single click", async () => {
    const recorder = recorderStub({ state: "recording", elapsed: 65 });
    renderCard({ recorder });
    expect(screen.getByText("Recording")).toBeVisible();
    expect(timer()).toHaveTextContent("01:05");
    expect(screen.queryByText(/stops automatically/)).not.toBeInTheDocument();

    fireEvent.click(button("Stop recording"), { detail: 2 });
    expect(recorder.stop).not.toHaveBeenCalled();

    await userEvent.click(button("Stop recording"));
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("warns near the recording limit", () => {
    renderCard({
      recorder: recorderStub({ state: "recording", warning: true }),
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "The recording stops automatically at 60 minutes.",
    );
  });

  it("feeds the microphone stream to the waveform", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as RenderingContext,
    );
    const stream = {} as MediaStream;
    renderCard({ recorder: recorderStub({ state: "recording", stream }) });

    expect(createAudioAnalyser).toHaveBeenCalledWith(stream);
  });

  describe("stopped", () => {
    it("offers save, discard and download", () => {
      renderCard({ recorder: stopped() });

      expect(screen.getByText("Ready to save")).toBeVisible();
      expect(timer()).toHaveTextContent("00:12");
      const title = screen.getByLabelText("Title");
      expect(title).toHaveValue("");
      expect(title).toHaveAttribute(
        "placeholder",
        expect.stringMatching(/^Recording /),
      );
      expect(title).toHaveAccessibleDescription(
        "Leave empty to use a title from the notes.",
      );
      expect(button("Save and transcribe")).toBeEnabled();
      expect(button("Discard")).toBeEnabled();
      const download = screen.getByRole("link", { name: "Download audio" });
      expect(download).toHaveAttribute("href", "blob:mock");
      expect(download).toHaveAttribute("download", "recording.webm");
    });

    it("saves without a title so the notes can name it", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderCard({ recorder: stopped() });

      fireEvent.click(button("Save and transcribe"), { detail: 2 });
      expect(onSubmit).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText("Title"), "   ");
      await user.click(button("Save and transcribe"));
      expect(onSubmit).toHaveBeenLastCalledWith({
        ...recording,
        title: undefined,
        source: "mic",
      });

      await user.type(screen.getByLabelText("Title"), " Planning  {Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: "Planning" }),
      );
    });

    it("discards through reset, then tells the parent", async () => {
      const recorder = stopped();
      const onDiscard = vi.fn();
      renderCard({ recorder, onDiscard });

      await userEvent.click(button("Discard"));

      expect(recorder.reset).toHaveBeenCalledTimes(1);
      expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it("revokes the download URL when the review form goes away", () => {
      const { unmount } = renderCard({ recorder: stopped() });
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      unmount();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });

    it("shows the save phase in a busy button and locks the form", async () => {
      const { onSubmit, rerender } = renderCard({ recorder: stopped() });
      const label = screen.getByText("Ready to save");

      rerender({ recorder: stopped(), busy: true });
      expect(button("Saving…")).toHaveAttribute("aria-busy", "true");
      rerender({
        recorder: stopped(),
        busy: true,
        phaseLabel: "Uploading audio…",
      });
      await userEvent.click(button("Uploading audio…"));

      expect(button("Uploading audio…")).toHaveAttribute("aria-busy", "true");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(button("Discard")).toBeDisabled();
      expect(screen.getByLabelText("Title")).toBeDisabled();
      expect(screen.getByText("Ready to save")).toBe(label);
      expect(label).toHaveClass("sr-only");
      expect(screen.getByText("Saving")).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("keyboard focus", () => {
    it("moves to the next action when the pressed one goes away", async () => {
      const user = userEvent.setup();
      const { rerender } = renderCard();

      await user.tab();
      await user.keyboard("{Enter}");
      rerender({ recorder: recorderStub({ state: "requesting" }) });
      expect(button("Waiting for microphone…")).toHaveFocus();

      rerender({ recorder: recorderStub({ state: "recording" }) });
      expect(button("Stop recording")).toHaveFocus();

      await user.keyboard("{Enter}");
      rerender({ recorder: stopped() });
      expect(button("Save and transcribe")).toHaveFocus();

      await user.click(button("Discard"));
      rerender({ recorder: recorderStub() });
      expect(button("Start recording")).toHaveFocus();
    });

    it("follows a retried microphone through the prompt to a refusal", async () => {
      const user = userEvent.setup();
      const { rerender } = renderCard({
        recorder: recorderStub({ state: "unavailable" }),
      });
      button("Try again").focus();

      await user.keyboard("{Enter}");
      rerender({ recorder: recorderStub({ state: "requesting" }) });
      expect(button("Waiting for microphone…")).toHaveFocus();

      rerender({ recorder: recorderStub({ state: "denied" }) });
      expect(
        screen.getByText("Microphone access is blocked").closest("[tabindex]"),
      ).toHaveFocus();
    });

    it("leaves focus alone when the change didn't come from the card", () => {
      const page = (recorder: Recorder) => (
        <>
          <button type="button">Elsewhere</button>
          <RecorderCard recorder={recorder} onSubmit={vi.fn()} />
        </>
      );
      const { rerender } = render(page(recorderStub({ state: "recording" })));
      button("Elsewhere").focus();

      rerender(page(stopped()));

      expect(button("Elsewhere")).toHaveFocus();
    });
  });

  describe("without a usable microphone", () => {
    it.each([
      ["denied", "Microphone access is blocked"],
      ["unavailable", "Couldn't start the microphone"],
      ["unsupported", "Recording isn't available in this browser"],
    ] as const)(
      "explains the %s state and offers the alternatives",
      (state, title) => {
        renderCard({ recorder: recorderStub({ state }) });

        expect(screen.getByText(title)).toBeVisible();
        expect(button("Try a 2-minute sample")).toBeEnabled();
        expect(button("Upload audio")).toBeEnabled();
        expect(
          screen.queryByRole("button", { name: "Start recording" }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      },
    );

    it("passes files from the alternatives on", async () => {
      const onRejectFile = vi.fn();
      const user = userEvent.setup({ applyAccept: false });
      const { onSubmit } = renderCard({
        recorder: recorderStub({ state: "denied" }),
        onRejectFile,
      });
      const input = screen.getByLabelText("Audio file");

      await user.upload(input, new File(["x"], "notes.txt"));
      expect(onRejectFile).toHaveBeenCalledWith(
        "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
      );

      const file = new File(["x"], "call.mp3", { type: "audio/mpeg" });
      await user.upload(input, file);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ blob: file, source: "upload" }),
      );
    });

    it("lets the user try the microphone again", async () => {
      const recorder = recorderStub({ state: "unavailable" });
      const onStart = vi.fn();
      renderCard({ recorder, onStart });

      await userEvent.click(button("Try again"));

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(recorder.start).toHaveBeenCalledTimes(1);
    });

    it("locks every option while saving", () => {
      renderCard({
        recorder: recorderStub({ state: "unavailable" }),
        busy: true,
      });

      expect(button("Try again")).toBeDisabled();
      expect(button("Try a 2-minute sample")).toBeDisabled();
      expect(button("Upload audio")).toBeDisabled();
    });
  });
});
