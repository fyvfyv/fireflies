import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranscriptPanel } from "./TranscriptPanel";

const panel = () => screen.getByRole("region", { name: "Transcript" });

describe("TranscriptPanel", () => {
  it("lists segments with mm:ss timestamps", () => {
    render(
      <TranscriptPanel
        text="Hello team. Let's start."
        segments={[
          { text: "Hello team.", startSecond: 0, endSecond: 2.5 },
          { text: " Let's start.", startSecond: 65.2, endSecond: 67 },
        ]}
      />,
    );

    const rows = within(panel()).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByText("01:05")).toBeVisible();
    expect(rows[1]).toHaveTextContent("01:05Let's start.");
    expect(rows[0]).toHaveTextContent("00:00Hello team.");
  });

  it.each([
    ["no segments", null],
    ["an empty segment list", []],
  ])("falls back to plain text with %s", (_, segments) => {
    render(
      <TranscriptPanel text="Hello team. Let's start." segments={segments} />,
    );

    expect(within(panel()).getByText("Hello team. Let's start.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says when no speech was detected", () => {
    render(<TranscriptPanel text="  " segments={[]} />);

    expect(panel()).toHaveTextContent("No speech was detected.");
  });

  it("shows a placeholder until the transcript exists", () => {
    render(<TranscriptPanel text={null} segments={null} />);

    expect(panel()).toHaveTextContent(
      "The transcript will appear here once transcription finishes.",
    );
  });
});
