import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AnalyserHandle } from "./audioAnalyser";
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
    stream: null,
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

const stopped = (overrides: Partial<Recorder> = {}) =>
  recorderStub({
    state: "stopped",
    elapsed: 12,
    result: recording,
    ...overrides,
  });

const timer = () => screen.getByRole("timer", { name: "Elapsed time" });

describe("RecorderCard", () => {
  describe("idle", () => {
    it("is ready to record", () => {
      render(<RecorderCard recorder={recorderStub()} onSubmit={vi.fn()} />);

      expect(screen.getByRole("region", { name: "Recorder" })).toBeVisible();
      expect(screen.getByText("Ready")).toBeVisible();
      expect(timer()).toHaveTextContent("00:00");
      expect(timer()).toHaveClass("type-timer", "text-faint");
      // Fixed digit cells keep the ticking clock from jittering; the value
      // is still read once, as a whole.
      expect(timer().querySelectorAll("[data-slot=digit]")).toHaveLength(4);
      expect(within(timer()).getByText("00:00")).toHaveClass("sr-only");
      expect(
        screen.getByText("Your browser will ask for microphone access."),
      ).toBeVisible();
    });

    it("shows the flat waveform", () => {
      const { container } = render(
        <RecorderCard recorder={recorderStub()} onSubmit={vi.fn()} />,
      );

      expect(container.querySelector("canvas")).toBeInTheDocument();
    });

    it("tells the parent, then starts recording", async () => {
      const recorder = recorderStub();
      const onStart = vi.fn();
      const user = userEvent.setup();
      render(
        <RecorderCard
          recorder={recorder}
          onSubmit={vi.fn()}
          onStart={onStart}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Start recording" }));

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(recorder.start).toHaveBeenCalledTimes(1);
      expect(onStart.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(recorder.start).mock.invocationCallOrder[0] ?? 0,
      );
    });

    it("can't start while a file or sample is being saved", () => {
      render(
        <RecorderCard recorder={recorderStub()} onSubmit={vi.fn()} busy />,
      );

      expect(
        screen.getByRole("button", { name: "Start recording" }),
      ).toBeDisabled();
    });
  });

  it("waits for microphone permission with a busy button", async () => {
    const recorder = recorderStub({ state: "requesting" });
    const user = userEvent.setup();
    render(<RecorderCard recorder={recorder} onSubmit={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: "Waiting for microphone…",
    });
    await user.click(button);

    expect(button).toHaveAttribute("aria-busy", "true");
    expect(recorder.start).not.toHaveBeenCalled();
    expect(screen.getByText(/allow microphone access/i)).toBeVisible();
  });

  describe("recording", () => {
    it("shows a pulsing dot, the running timer and a stop button", async () => {
      const recorder = recorderStub({ state: "recording", elapsed: 65 });
      const user = userEvent.setup();
      const { container } = render(
        <RecorderCard recorder={recorder} onSubmit={vi.fn()} />,
      );

      expect(screen.getByText("Recording")).toBeVisible();
      expect(container.querySelector(".animate-rec-pulse")).toHaveClass(
        "bg-rec",
      );
      expect(timer()).toHaveTextContent("01:05");
      expect(timer()).toHaveClass("text-ink");
      expect(
        screen.queryByRole("button", { name: "Start recording" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/stops automatically/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Stop recording" }));
      expect(recorder.stop).toHaveBeenCalledTimes(1);
    });

    it("ignores the second click of a double click", () => {
      const recorder = recorderStub({ state: "recording" });
      render(<RecorderCard recorder={recorder} onSubmit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: "Stop recording" }), {
        detail: 2,
      });

      expect(recorder.stop).not.toHaveBeenCalled();
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
        "The recording stops automatically at 60 minutes.",
      );
    });

    it("feeds the microphone stream to the waveform", () => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (media) =>
          ({
            matches: media === "(prefers-reduced-motion: reduce)",
            media,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
      const stream = {} as MediaStream;
      const createAnalyser = vi.fn(
        (): AnalyserHandle => ({
          analyser: { fftSize: 256, getFloatTimeDomainData: () => {} },
          dispose: () => {},
        }),
      );

      render(
        <RecorderCard
          recorder={recorderStub({ state: "recording", stream })}
          onSubmit={vi.fn()}
          createAnalyser={createAnalyser}
        />,
      );

      expect(createAnalyser).toHaveBeenCalledWith(stream);
    });
  });

  describe("stopped", () => {
    it("offers save, discard and download", () => {
      render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} />);

      expect(screen.getByText("Ready to save")).toBeVisible();
      expect(timer()).toHaveTextContent("00:12");
      expect(within(timer()).getByText("00:12")).toHaveClass("sr-only");
      expect(timer().querySelectorAll("[data-slot=digit]")).toHaveLength(4);
      const title = screen.getByLabelText("Title");
      expect(title).toHaveValue("");
      expect(title).toHaveAttribute(
        "placeholder",
        expect.stringMatching(/^Recording /),
      );
      expect(
        screen.getByRole("button", { name: "Save and transcribe" }),
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
      const download = screen.getByRole("link", { name: "Download audio" });
      expect(download).toHaveAttribute("href", "blob:mock");
      expect(download).toHaveAttribute("download", "recording.webm");
    });

    it("explains the optional title at readable contrast", () => {
      render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} />);

      expect(screen.getByLabelText("Title")).toHaveAccessibleDescription(
        "Leave empty to use a title from the notes.",
      );
      expect(
        screen.getByText("Leave empty to use a title from the notes."),
      ).toHaveClass("text-graphite");
    });

    it("draws a flush ink edge on the focused title field", () => {
      render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} />);

      const title = screen.getByLabelText("Title");
      expect(title).toHaveClass(
        "focus-visible:border-ink",
        "focus-visible:ring-1",
        "focus-visible:ring-ink",
        // Hidden normally, but a transparent outline that forced-colors mode
        // paints, since it drops the ring and recolours the border there.
        "focus-visible:outline-hidden",
      );
    });

    it("saves without a title so the summary can name it", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

      await user.click(
        screen.getByRole("button", { name: "Save and transcribe" }),
      );

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

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Planning" }),
      );
    });

    it("treats a blank title as no title", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText("Title"), "   ");
      await user.click(
        screen.getByRole("button", { name: "Save and transcribe" }),
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: undefined }),
      );
    });

    it("ignores the second click of a double click on save", () => {
      const onSubmit = vi.fn();
      render(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Save and transcribe" }),
        { detail: 2 },
      );

      expect(onSubmit).not.toHaveBeenCalled();
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

    it("shows the save phase in a busy button and locks the form", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      render(
        <RecorderCard
          recorder={stopped()}
          onSubmit={onSubmit}
          busy
          phaseLabel="Uploading audio…"
        />,
      );

      const save = screen.getByRole("button", { name: "Uploading audio…" });
      await user.click(save);

      expect(save).toHaveAttribute("aria-busy", "true");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText("Saving")).toBeVisible();
      expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
      expect(screen.getByLabelText("Title")).toBeDisabled();
    });

    it("shows it is saving without announcing it a second time", () => {
      const { rerender } = render(
        <RecorderCard recorder={stopped()} onSubmit={vi.fn()} />,
      );
      const label = screen.getByText("Ready to save");

      rerender(
        <RecorderCard
          recorder={stopped()}
          onSubmit={vi.fn()}
          busy
          phaseLabel="Uploading audio…"
        />,
      );

      // The page's status line announces each phase; the live label keeps
      // the same text node so it stays quiet.
      expect(screen.getByText("Ready to save")).toBe(label);
      expect(label.closest("[aria-live]")).not.toBeNull();
      expect(label).toHaveClass("sr-only");
      expect(screen.getByText("Saving")).toHaveAttribute("aria-hidden", "true");
    });

    it("falls back to a generic saving label", () => {
      render(<RecorderCard recorder={stopped()} onSubmit={vi.fn()} busy />);

      expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
  });

  describe("keyboard focus", () => {
    it("moves to the next action when the pressed one goes away", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { rerender } = render(
        <RecorderCard recorder={recorderStub()} onSubmit={onSubmit} />,
      );

      await user.tab();
      await user.keyboard("{Enter}");
      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "requesting" })}
          onSubmit={onSubmit}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Waiting for microphone…" }),
      ).toHaveFocus();

      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "recording" })}
          onSubmit={onSubmit}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Stop recording" }),
      ).toHaveFocus();

      await user.keyboard("{Enter}");
      rerender(<RecorderCard recorder={stopped()} onSubmit={onSubmit} />);
      expect(
        screen.getByRole("button", { name: "Save and transcribe" }),
      ).toHaveFocus();

      await user.click(screen.getByRole("button", { name: "Discard" }));
      rerender(<RecorderCard recorder={recorderStub()} onSubmit={onSubmit} />);
      expect(
        screen.getByRole("button", { name: "Start recording" }),
      ).toHaveFocus();
    });

    it("moves to the waiting button after trying the microphone again", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const { rerender } = render(
        <RecorderCard
          recorder={recorderStub({ state: "unavailable" })}
          onSubmit={onSubmit}
        />,
      );
      screen.getByRole("button", { name: "Try again" }).focus();

      await user.keyboard("{Enter}");
      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "requesting" })}
          onSubmit={onSubmit}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Waiting for microphone…" }),
      ).toHaveFocus();

      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "recording" })}
          onSubmit={onSubmit}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Stop recording" }),
      ).toHaveFocus();
    });

    it("moves to the explanation when a retried microphone is refused", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <RecorderCard
          recorder={recorderStub({ state: "unavailable" })}
          onSubmit={vi.fn()}
        />,
      );
      screen.getByRole("button", { name: "Try again" }).focus();

      await user.keyboard("{Enter}");
      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "requesting" })}
          onSubmit={vi.fn()}
        />,
      );
      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "denied" })}
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Microphone access is blocked").closest("[tabindex]"),
      ).toHaveFocus();
    });

    it("moves to the explanation when the microphone is refused", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <RecorderCard recorder={recorderStub()} onSubmit={vi.fn()} />,
      );
      await user.click(screen.getByRole("button", { name: "Start recording" }));

      rerender(
        <RecorderCard
          recorder={recorderStub({ state: "denied" })}
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Microphone access is blocked").closest("[tabindex]"),
      ).toHaveFocus();
    });

    it("leaves focus alone when the change didn't come from the card", () => {
      const { rerender } = render(
        <>
          <button type="button">Elsewhere</button>
          <RecorderCard
            recorder={recorderStub({ state: "recording" })}
            onSubmit={vi.fn()}
          />
        </>,
      );
      screen.getByRole("button", { name: "Elsewhere" }).focus();

      rerender(
        <>
          <button type="button">Elsewhere</button>
          <RecorderCard recorder={stopped()} onSubmit={vi.fn()} />
        </>,
      );

      expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
    });
  });

  describe("without a usable microphone", () => {
    it("explains a blocked microphone and offers the alternatives", () => {
      const { container } = render(
        <RecorderCard
          recorder={recorderStub({ state: "denied" })}
          onSubmit={vi.fn()}
        />,
      );

      expect(screen.getByText("Microphone access is blocked")).toBeVisible();
      expect(screen.getByText("No microphone?")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Try a 2-minute sample" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Upload audio" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Start recording" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("timer")).not.toBeInTheDocument();
      expect(container.querySelector("canvas")).not.toBeInTheDocument();
    });

    it("explains an unsupported browser and offers the alternatives", () => {
      render(
        <RecorderCard
          recorder={recorderStub({ state: "unsupported" })}
          onSubmit={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Recording isn't available in this browser"),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Try a 2-minute sample" }),
      ).toBeVisible();
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

    it("reports a file the alternatives reject", async () => {
      const onRejectFile = vi.fn();
      const user = userEvent.setup({ applyAccept: false });
      render(
        <RecorderCard
          recorder={recorderStub({ state: "denied" })}
          onSubmit={vi.fn()}
          onRejectFile={onRejectFile}
        />,
      );

      await user.upload(
        screen.getByLabelText("Audio file"),
        new File(["x"], "notes.txt", { type: "text/plain" }),
      );

      expect(onRejectFile).toHaveBeenCalledWith(
        "Choose an audio file (WebM, M4A, MP3, WAV or OGG).",
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

      expect(
        screen.getByRole("button", { name: "Try a 2-minute sample" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Upload audio" }),
      ).toBeDisabled();
    });

    it("lets the user try again when the mic could not start", async () => {
      const recorder = recorderStub({ state: "unavailable" });
      const onStart = vi.fn();
      const user = userEvent.setup();
      render(
        <RecorderCard
          recorder={recorder}
          onSubmit={vi.fn()}
          onStart={onStart}
        />,
      );

      expect(screen.getByText("Couldn't start the microphone")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(onStart).toHaveBeenCalledTimes(1);
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
});
