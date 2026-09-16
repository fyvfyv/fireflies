import { expect, it } from "vitest";
import { tw } from "./twMerge";

it("drops falsy values and lets the later conflicting class win", () => {
  expect(tw("p-2 text-sm", false, null, "p-4")).toBe("text-sm p-4");
});

it("treats text-* tokens as font sizes, not colors", () => {
  expect(tw("text-sm", "text-caption")).toBe("text-caption");
  expect(tw("text-caption", "text-ink")).toBe("text-caption text-ink");
});

it("lets type-* replace, and be replaced by, single type properties", () => {
  expect(
    tw(
      "text-sm leading-tight font-bold tracking-wide font-stretch-condensed",
      "type-title",
    ),
  ).toBe("type-title");
  expect(tw("type-title", "text-body")).toBe("text-body");
  expect(tw("type-display", "font-medium leading-none")).toBe(
    "type-display font-medium leading-none",
  );
});

it("dedupes custom colors per property", () => {
  expect(tw("bg-sheet", "text-ink", "bg-topic-6")).toBe("text-ink bg-topic-6");
});

it("dedupes custom radius, shadow, animation and easing tokens", () => {
  expect(tw("rounded-md", "rounded-sheet")).toBe("rounded-sheet");
  expect(tw("shadow-sm", "shadow-float")).toBe("shadow-float");
  expect(tw("shadow-float", "shadow-ink")).toBe("shadow-float shadow-ink");
  expect(tw("animate-spin", "animate-toast-in")).toBe("animate-toast-in");
  expect(tw("ease-in", "ease-out-soft")).toBe("ease-out-soft");
});
