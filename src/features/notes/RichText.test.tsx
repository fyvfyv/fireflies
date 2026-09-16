import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseRichText, RichText } from "./RichText";

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe("parseRichText", () => {
  it.each([
    ["plain text", [plain("plain text")]],
    [
      "The team will **ship** now",
      [plain("The team will "), bold("ship"), plain(" now")],
    ],
    ["**one** and **two", [bold("one"), plain(" and **two")]],
    ["empty **** pair", [plain("empty **** pair")]],
    ["", []],
  ])("%j", (input, expected) => {
    expect(parseRichText(input)).toEqual(expected);
  });
});

describe("RichText", () => {
  it("renders bold spans as strong and never interprets HTML", () => {
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
