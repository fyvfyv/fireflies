import { describe, expect, it } from "vitest";
import { tw } from "./twMerge";

describe("tw", () => {
  it("lets the later conflicting class win", () => {
    expect(tw("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy conditionals", () => {
    const active = false;
    expect(tw("px-2", active && "bg-red-500", null, undefined, "")).toBe(
      "px-2",
    );
  });

  it("keeps non-conflicting classes", () => {
    expect(tw("px-2 py-1", "text-sm font-medium")).toBe(
      "px-2 py-1 text-sm font-medium",
    );
  });

  it("treats custom text tokens as font sizes, not colors", () => {
    expect(tw("text-sm", "text-caption")).toBe("text-caption");
    expect(tw("text-caption", "text-red-500")).toBe(
      "text-caption text-red-500",
    );
  });
});
