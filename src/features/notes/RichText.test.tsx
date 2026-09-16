import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseRichText, RichText, stripRichText } from "./RichText";

describe("parseRichText", () => {
  it.each([
    ["plain text", [{ text: "plain text", bold: false }]],
    [
      "The team will **ship on Friday** now",
      [
        { text: "The team will ", bold: false },
        { text: "ship on Friday", bold: true },
        { text: " now", bold: false },
      ],
    ],
    [
      "**Ana** and **Ben**",
      [
        { text: "Ana", bold: true },
        { text: " and ", bold: false },
        { text: "Ben", bold: true },
      ],
    ],
    ["an **unmatched marker", [{ text: "an **unmatched marker", bold: false }]],
    [
      "**one** and **two",
      [
        { text: "one", bold: true },
        { text: " and **two", bold: false },
      ],
    ],
    ["empty **** pair", [{ text: "empty **** pair", bold: false }]],
    ["", []],
  ])("%j", (input, expected) => {
    expect(parseRichText(input)).toEqual(expected);
  });
});

describe("stripRichText", () => {
  it("drops bold markers but keeps unmatched ones", () => {
    expect(stripRichText("**Ana** tags the **release")).toBe(
      "Ana tags the **release",
    );
  });
});

describe("RichText", () => {
  it("renders bold spans as strong and everything else as text", () => {
    const { container } = render(
      <p>
        <RichText text="The team will **ship on Friday** <img src=x onerror=alert(1)>" />
      </p>,
    );

    expect(container.querySelector("strong")).toHaveTextContent(
      "ship on Friday",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent(
      "The team will ship on Friday <img src=x onerror=alert(1)>",
    );
  });
});
