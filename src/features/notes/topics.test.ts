import { describe, expect, it } from "vitest";
import { topicBackground } from "./topics";

describe("topicBackground", () => {
  it.each([
    [0, "bg-topic-1"],
    [5, "bg-topic-6"],
    [6, "bg-topic-1"],
    [13, "bg-topic-2"],
    [-1, "bg-topic-6"],
  ])("section %s → %s", (index, expected) => {
    expect(topicBackground(index)).toBe(expected);
  });
});
