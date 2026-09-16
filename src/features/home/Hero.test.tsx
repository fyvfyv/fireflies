import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("leads with the promise as the page heading", () => {
    render(<Hero recorder={null} />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(
      "Record the meeting. Get notes that point back to every moment.",
    );
    expect(heading).toHaveClass("type-display");
    // The highlighter is kept for moments in the notes, not the headline.
    expect(heading.querySelector(".marker")).toBeNull();
    expect(
      screen.getByText(
        "Transcript, topic notes and action items in about a minute.",
      ),
    ).toHaveClass("type-lead", "text-graphite");
    expect(
      screen.getByRole("region", { name: /Record the meeting/ }),
    ).toBeInTheDocument();
  });

  it("places the recorder, its feedback and the mic-free options", () => {
    render(
      <Hero
        recorder={<div>Recorder sheet</div>}
        feedback={<p>Uploading audio…</p>}
        options={<p>No microphone?</p>}
      />,
    );

    const recorder = screen.getByText("Recorder sheet");
    const feedback = screen.getByText("Uploading audio…");
    const options = screen.getByText("No microphone?");
    // Source order is the mobile order: copy, recorder, options.
    expect(
      recorder.compareDocumentPosition(options) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(recorder.parentElement).toBe(feedback.parentElement);
  });
});
