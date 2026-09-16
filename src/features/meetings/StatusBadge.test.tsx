import type { MeetingStatus } from "@shared/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each<[MeetingStatus, string]>([
    ["failed", "Failed"],
    ["uploaded", "Waiting"],
    ["transcribing", "Transcribing"],
    ["transcribed", "Writing notes"],
    ["summarizing", "Writing notes"],
  ])("labels a %s run %s", (status, label) => {
    render(<StatusBadge status={status} stalled={false} />);

    expect(screen.getByText(label)).toBeVisible();
  });

  it("names a finished run for screen readers only", () => {
    render(<StatusBadge status="done" stalled={false} />);

    expect(screen.getByText("Done")).toHaveClass("sr-only");
  });

  it("labels a stalled run as interrupted", () => {
    render(<StatusBadge status="transcribing" stalled />);

    expect(screen.getByText("Interrupted")).toBeVisible();
    expect(screen.queryByText("Transcribing")).not.toBeInTheDocument();
  });
});
