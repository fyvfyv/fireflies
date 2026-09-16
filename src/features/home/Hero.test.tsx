import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("Hero", () => {
  it("is named by its heading and puts the recorder before the options", () => {
    render(
      <Hero
        recorder={<div>Recorder sheet</div>}
        options={<p>No microphone?</p>}
      />,
    );

    expect(
      screen.getByRole("region", {
        name: "Record the meeting. Get notes that point back to every moment.",
      }),
    ).toBeInTheDocument();
    const recorder = screen.getByText("Recorder sheet");
    const options = screen.getByText("No microphone?");
    expect(
      recorder.compareDocumentPosition(options) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
