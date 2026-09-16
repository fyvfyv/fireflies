import type { MeetingStatus } from "@shared/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each<[MeetingStatus, string]>([
    ["uploaded", "Uploaded"],
    ["transcribing", "Transcribing"],
    ["transcribed", "Transcribed"],
    ["summarizing", "Summarizing"],
    ["done", "Done"],
    ["failed", "Failed"],
  ])("labels %s as %s", (status, label) => {
    render(<StatusBadge status={status} stalled={false} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("labels a stalled run as interrupted", () => {
    render(<StatusBadge status="transcribing" stalled />);

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.queryByText("Transcribing")).not.toBeInTheDocument();
  });
});
