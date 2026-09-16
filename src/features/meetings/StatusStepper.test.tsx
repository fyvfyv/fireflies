import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      "Upload (completed)",
      "Transcript (in progress)",
      "Notes (not started)",
      "Done (not started)",
    ]);
  });

  it("keeps every label whole and readable", () => {
    render(
      <StatusStepper
        meeting={{ status: "summarizing", errorStep: null, stalled: false }}
      />,
    );

    // Columns grow to fit their label instead of cutting it off at 360 px.
    expect(screen.getByRole("list")).toHaveClass(
      "grid-cols-[repeat(4,minmax(max-content,1fr))]",
    );
    const labels = steps().map((step) => step.lastElementChild);
    for (const label of labels) expect(label).not.toHaveClass("truncate");
    // Pending labels stay above 4.5:1 contrast.
    expect(labels[3]).toHaveClass("text-graphite");
    expect(labels[3]).not.toHaveClass("text-faint");
  });

  it("marks the active step as current and announces progress", () => {
    render(
      <StatusStepper
        meeting={{ status: "summarizing", errorStep: null, stalled: false }}
      />,
    );

    const current = steps().filter((step) => step.ariaCurrent === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Notes (in progress)");
    expect(screen.getByRole("status")).toHaveTextContent("Writing the notes…");
  });

  it.each<[StepperMeeting, string, string]>([
    [
      { status: "failed", errorStep: "transcribe", stalled: false },
      "Transcript (failed)",
      "Transcription failed",
    ],
    [
      { status: "failed", errorStep: "summarize", stalled: false },
      "Notes (failed)",
      "Notes failed",
    ],
    [
      { status: "transcribing", errorStep: null, stalled: true },
      "Transcript (interrupted)",
      "Processing was interrupted",
    ],
  ])("describes a problem at %j", (meeting, stepText, message) => {
    render(<StatusStepper meeting={meeting} />);

    expect(stepTexts()).toContain(stepText);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(steps().some((step) => step.ariaCurrent === "step")).toBe(false);
    // The failure banner says it visibly; the status is kept for the
    // announcement only. The whole message block leaves the flow, so the
    // gap above it doesn't leave blank space under the steps.
    const block = screen.getByRole("status").closest(".sr-only");
    expect(block).not.toBeNull();
    expect(block).toContainElement(screen.getByRole("status"));
    expect(block?.parentElement).toHaveClass("flex", "flex-col", "gap-5");
    expect(block?.parentElement).not.toHaveClass("space-y-5");
  });

  it("shows the running message visibly", () => {
    render(
      <StatusStepper
        meeting={{ status: "summarizing", errorStep: null, stalled: false }}
      />,
    );

    expect(screen.getByRole("status").closest(".sr-only")).toBeNull();
  });

  it("announces a finished meeting", () => {
    render(
      <StatusStepper
        meeting={{ status: "done", errorStep: null, stalled: false }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Notes ready");
  });

  it.each<[StepperMeeting["status"], string, string]>([
    [
      "uploaded",
      "Starting…",
      "The recording is uploaded. Transcription starts in a moment.",
    ],
    [
      "transcribing",
      "Transcribing the recording…",
      "Longer recordings take up to a minute.",
    ],
    [
      "transcribed",
      "Writing the notes…",
      "The transcript is ready to read while you wait.",
    ],
    [
      "summarizing",
      "Writing the notes…",
      "The transcript is ready to read while you wait.",
    ],
  ])("explains the %s step", (status, message, detail) => {
    render(
      <StatusStepper meeting={{ status, errorStep: null, stalled: false }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByText(detail)).toBeVisible();
  });

  it("counts the time since the run started", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-17T12:01:05Z") });
    render(
      <StatusStepper
        meeting={{ status: "transcribing", errorStep: null, stalled: false }}
        since="2026-09-17T12:00:00.000Z"
      />,
    );

    expect(screen.getByText("1:05")).toBeVisible();
    expect(screen.getByText("Elapsed")).toHaveClass("sr-only");
    const elapsed = screen.getByText("Elapsed").parentElement as HTMLElement;
    // Fixed cells keep the ticking clock from jittering.
    expect(
      [...elapsed.querySelectorAll("[data-slot='digit']")].map(
        (cell) => cell.textContent,
      ),
    ).toEqual(["1", "0", "5"]);
    // The digits, not the icon, give the clock its baseline, so it lines up
    // with the message text.
    expect(elapsed.lastElementChild).toHaveClass("self-baseline");
    // Inline after the message, outside the status region.
    const status = screen.getByRole("status");
    expect(status).not.toContainElement(elapsed);
    expect(elapsed.parentElement).toBe(status.parentElement);

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("1:07")).toBeVisible();
  });

  it.each<[string, StepperMeeting]>([
    ["failed", { status: "failed", errorStep: "transcribe", stalled: false }],
    ["stalled", { status: "transcribing", errorStep: null, stalled: true }],
    ["done", { status: "done", errorStep: null, stalled: false }],
  ])("shows no running time once %s", (_, meeting) => {
    render(
      <StatusStepper meeting={meeting} since="2026-09-17T12:00:00.000Z" />,
    );

    expect(screen.queryByText("Elapsed")).not.toBeInTheDocument();
  });
});
