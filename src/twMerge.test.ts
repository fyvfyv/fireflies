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

  it.each([
    "caption",
    "small",
    "body",
    "lead",
    "heading",
    "title",
    "display",
    "timer",
  ])("dedupes the text-%s size against other sizes only", (size) => {
    expect(tw("text-sm", `text-${size}`)).toBe(`text-${size}`);
    expect(tw(`text-${size}`, "text-lg")).toBe("text-lg");
    expect(tw(`text-${size}`, "text-ink")).toBe(`text-${size} text-ink`);
    expect(tw(`text-${size}`, "leading-tight")).toBe(
      `text-${size} leading-tight`,
    );
  });

  describe("type-* composite styles", () => {
    it.each([
      "caption",
      "small",
      "body",
      "lead",
      "heading",
      "title",
      "display",
      "timer",
    ])(
      "replaces earlier size, leading, weight and width with type-%s",
      (name) => {
        expect(
          tw(
            "text-sm leading-tight font-bold tracking-wide font-stretch-condensed",
            `type-${name}`,
          ),
        ).toBe(`type-${name}`);
      },
    );

    it("is replaced by a later type or size", () => {
      expect(tw("type-title", "type-heading")).toBe("type-heading");
      expect(tw("type-title", "text-body")).toBe("text-body");
    });

    it("keeps later single-property refinements and colors", () => {
      expect(tw("type-title", "font-medium text-graphite")).toBe(
        "type-title font-medium text-graphite",
      );
      expect(tw("type-display", "leading-none")).toBe(
        "type-display leading-none",
      );
    });
  });

  it("dedupes custom color tokens per property", () => {
    expect(tw("bg-sheet", "bg-paper")).toBe("bg-paper");
    expect(tw("bg-marker", "bg-sunken")).toBe("bg-sunken");
    expect(tw("text-ink", "text-graphite")).toBe("text-graphite");
    expect(tw("text-faint", "text-marker-ink")).toBe("text-marker-ink");
    expect(tw("border-rule", "border-danger")).toBe("border-danger");
    expect(tw("bg-topic-1", "bg-topic-6")).toBe("bg-topic-6");
    expect(tw("text-ok", "text-rec")).toBe("text-rec");
    expect(tw("bg-ink", "text-ink", "border-ink")).toBe(
      "bg-ink text-ink border-ink",
    );
    expect(tw("border", "border-rule")).toBe("border border-rule");
  });

  it("dedupes custom radius tokens", () => {
    expect(tw("rounded-md", "rounded-sheet")).toBe("rounded-sheet");
    expect(tw("rounded-sheet", "rounded-control")).toBe("rounded-control");
    expect(tw("rounded-control", "rounded-chip")).toBe("rounded-chip");
    expect(tw("rounded-chip", "rounded-mark")).toBe("rounded-mark");
    expect(tw("rounded-control", "rounded-t-none")).toBe(
      "rounded-control rounded-t-none",
    );
  });

  it("treats shadow-float as a shadow size, not a shadow color", () => {
    expect(tw("shadow-sm", "shadow-float")).toBe("shadow-float");
    expect(tw("shadow-float", "shadow-none")).toBe("shadow-none");
    expect(tw("shadow-float", "shadow-ink")).toBe("shadow-float shadow-ink");
  });

  it("dedupes custom animations and easing", () => {
    for (const name of [
      "marker-sweep",
      "reveal",
      "shimmer",
      "rec-pulse",
      "toast-in",
      "toast-out",
    ]) {
      expect(tw("animate-spin", `animate-${name}`)).toBe(`animate-${name}`);
    }
    expect(tw("ease-in", "ease-out-soft")).toBe("ease-out-soft");
  });
});
