import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusStepper, type StepperMeeting } from "./StatusStepper";

const running = (status: StepperMeeting["status"]): StepperMeeting => ({
  status,
  errorStep: null,
  stalled: false,
});
const failed = (errorStep: StepperMeeting["errorStep"]): StepperMeeting => ({
  status: "failed",
  errorStep,
  stalled: false,
});
const stalled: StepperMeeting = { ...running("transcribing"), stalled: true };

const since = "2026-09-17T12:00:00.000Z";

const steps = () => screen.getAllByRole("listitem");
const status = () => screen.getByRole("status");

describe("StatusStepper", () => {
  it.each<[string, StepperMeeting, string]>([
    ["uploaded", running("uploaded"), "done active pending pending"],
    ["transcribed", running("transcribed"), "done done active pending"],
    ["summarizing", running("summarizing"), "done done active pending"],
    ["done", running("done"), "done done done done"],
    ["failed notes", failed("summarize"), "done done error pending"],
    ["failed without a step", failed(null), "done error pending pending"],
    ["stalled", stalled, "done stalled pending pending"],
  ])("marks the steps of a %s meeting", (_, meeting, expected) => {
    render(<StatusStepper meeting={meeting} />);

    expect(steps().map((step) => step.dataset.state)).toEqual(
      expected.split(" "),
    );
  });

  it("labels each step with its state and marks the current one", () => {
    render(<StatusStepper meeting={running("transcribing")} />);

    expect(steps().map((step) => step.textContent)).toEqual([
      "Upload (completed)",
      "Transcript (in progress)",
      "Notes (not started)",
      "Done (not started)",
    ]);
    expect(screen.getByRole("listitem", { current: "step" })).toBe(steps()[1]);
  });

  const writing = "The transcript is ready to read while you wait.";
  it.each<[StepperMeeting, string, string]>([
    [
      running("uploaded"),
      "Starting…",
      "The recording is uploaded. Transcription starts in a moment.",
    ],
    [
      running("transcribing"),
      "Transcribing the recording…",
      "Longer recordings take up to a minute.",
    ],
    [running("transcribed"), "Writing the notes…", writing],
    [running("summarizing"), "Writing the notes…", writing],
  ])("explains the running %j step", (meeting, message, detail) => {
    render(<StatusStepper meeting={meeting} since={since} />);

    expect(status()).toHaveTextContent(message);
    expect(status().closest(".sr-only")).toBeNull();
    expect(screen.getByText(detail)).toBeVisible();
    expect(screen.getByText("Elapsed")).toBeInTheDocument();
  });

  it("says the notes are ready, without a clock", () => {
    render(<StatusStepper meeting={running("done")} since={since} />);

    expect(status()).toHaveTextContent("Notes ready");
    expect(status().closest(".sr-only")).toBeNull();
    expect(screen.queryByText("Elapsed")).not.toBeInTheDocument();
  });

  it.each<[StepperMeeting, string, string]>([
    [failed("transcribe"), "Transcript (failed)", "Transcription failed"],
    [failed("summarize"), "Notes (failed)", "Notes failed"],
    [stalled, "Transcript (interrupted)", "Processing was interrupted"],
  ])("only announces a problem at %j", (meeting, stepText, message) => {
    render(<StatusStepper meeting={meeting} since={since} />);

    expect(steps().map((step) => step.textContent)).toContain(stepText);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    expect(status()).toHaveTextContent(message);
    expect(status().closest(".sr-only")).not.toBeNull();
    expect(screen.queryByText("Elapsed")).not.toBeInTheDocument();
  });

  it("counts the time since the run started, outside the status", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T12:01:05Z") });
    render(<StatusStepper meeting={running("transcribing")} since={since} />);

    expect(screen.getByText("1:05")).toBeVisible();
    expect(status()).not.toContainElement(screen.getByText("Elapsed"));

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("1:07")).toBeVisible();
  });
});
