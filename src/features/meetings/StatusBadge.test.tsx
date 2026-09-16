import type { MeetingStatus } from "@shared/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("marks a finished meeting with a check that only screen readers name", () => {
    const { container } = render(<StatusBadge status="done" stalled={false} />);

    expect(screen.getByText("Done")).toHaveClass("sr-only");
    expect(container.querySelector("svg")).toHaveClass("text-ok");
  });

  it.each<[MeetingStatus, string]>([
    ["uploaded", "Waiting"],
    ["transcribing", "Transcribing"],
    // Between the two steps a run is about to write the notes.
    ["transcribed", "Writing notes"],
    ["summarizing", "Writing notes"],
  ])("shows %s as work in progress: %s", (status, label) => {
    const { container } = render(
      <StatusBadge status={status} stalled={false} />,
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(label)).not.toHaveClass("sr-only");
    expect(
      container.querySelectorAll('[data-slot="progress-dot"]'),
    ).toHaveLength(3);
  });

  it("labels a failed run in the danger color", () => {
    render(<StatusBadge status="failed" stalled={false} />);

    expect(screen.getByText("Failed").parentElement).toHaveClass("text-danger");
  });

  it("labels a stalled run as interrupted, without progress dots", () => {
    const { container } = render(<StatusBadge status="transcribing" stalled />);

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByText("Transcribing")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="progress-dot"]'),
    ).not.toBeInTheDocument();
  });
});
