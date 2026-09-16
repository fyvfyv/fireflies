import { describe, expect, it } from "vitest";
import { topicBackground } from "./topics";

describe("topicBackground", () => {
  it("cycles through the six topic colors", () => {
    expect([0, 5, 6, 13].map(topicBackground)).toEqual([
      "bg-topic-1",
      "bg-topic-6",
      "bg-topic-1",
      "bg-topic-2",
    ]);
  });
});
