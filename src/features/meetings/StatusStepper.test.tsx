import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusStepper, type StepperMeeting } from "./StatusStepper";

const steps = () => screen.getAllByRole("listitem");
const stepStates = () => steps().map((step) => step.dataset.state);
const stepTexts = () => steps().map((step) => step.textContent);

describe("StatusStepper", () => {
  it.each<[string, StepperMeeting, string[]]>([
    [
      "uploaded",
      { status: "uploaded", errorStep: null, stalled: false },
      ["done", "active", "pending", "pending"],
    ],
    [
      "transcribing",
      { status: "transcribing", errorStep: null, stalled: false },
      ["done", "active", "pending", "pending"],
    ],
    [
      "transcribed",
      { status: "transcribed", errorStep: null, stalled: false },
      ["done", "done", "active", "pending"],
    ],
    [
      "summarizing",
      { status: "summarizing", errorStep: null, stalled: false },
      ["done", "done", "active", "pending"],
    ],
    [
      "done",
      { status: "done", errorStep: null, stalled: false },
      ["done", "done", "done", "done"],
    ],
    [
      "failed(transcribe)",
      { status: "failed", errorStep: "transcribe", stalled: false },
      ["done", "error", "pending", "pending"],
    ],
    [
      "failed(summarize)",
      { status: "failed", errorStep: "summarize", stalled: false },
      ["done", "done", "error", "pending"],
    ],
    [
      "failed without a step",
      { status: "failed", errorStep: null, stalled: false },
      ["done", "error", "pending", "pending"],
    ],
    [
      "stalled transcribing",
      { status: "transcribing", errorStep: null, stalled: true },
      ["done", "stalled", "pending", "pending"],
    ],
    [
      "stalled summarizing",
      { status: "summarizing", errorStep: null, stalled: true },
      ["done", "done", "stalled", "pending"],
    ],
  ])("%s → %j", (_, meeting, expected) => {
    render(<StatusStepper meeting={meeting} />);

    expect(stepStates()).toEqual(expected);
  });

  it("labels the steps in pipeline order with their state", () => {
    render(
      <StatusStepper
        meeting={{ status: "transcribing", errorStep: null, stalled: false }}
      />,
    );

    expect(
      screen.getByRole("list", { name: "Processing steps" }),
    ).toBeVisible();
    expect(stepTexts()).toEqual([
      "Uploaded (completed)",
      "Transcribing (in progress)",
      "Summarizing (not started)",
      "Done (not started)",
    ]);
  });

  it("marks the active step as current and announces progress", () => {
    render(
      <StatusStepper
        meeting={{ status: "summarizing", errorStep: null, stalled: false }}
      />,
    );

    const current = steps().filter((step) => step.ariaCurrent === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Summarizing (in progress)");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Writing the summary…",
    );
  });

  it.each<[StepperMeeting, string, string]>([
    [
      { status: "failed", errorStep: "transcribe", stalled: false },
      "Transcribing (failed)",
      "Transcription failed",
    ],
    [
      { status: "failed", errorStep: "summarize", stalled: false },
      "Summarizing (failed)",
      "Summary failed",
    ],
    [
      { status: "transcribing", errorStep: null, stalled: true },
      "Transcribing (interrupted)",
      "Processing was interrupted",
    ],
  ])("describes a problem at %j", (meeting, stepText, message) => {
    render(<StatusStepper meeting={meeting} />);

    expect(stepTexts()).toContain(stepText);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(steps().some((step) => step.ariaCurrent === "step")).toBe(false);
  });

  it("announces a finished meeting", () => {
    render(
      <StatusStepper
        meeting={{ status: "done", errorStep: null, stalled: false }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Summary ready");
  });
});
