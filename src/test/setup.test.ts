import { describe, expect, it, vi } from "vitest";

// These stubs are shared by every client test; a test that needs different
// behavior overrides them locally (vi.spyOn / vi.stubGlobal).
describe("jsdom stubs", () => {
  it("provides a ResizeObserver that can observe", () => {
    const observer = new ResizeObserver(() => {});
    expect(() => {
      observer.observe(document.body);
      observer.unobserve(document.body);
      observer.disconnect();
    }).not.toThrow();
  });

  it("reports no reduced motion and no matching width queries", () => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    expect(query.matches).toBe(false);
    expect(query.media).toBe("(prefers-reduced-motion: reduce)");
    expect(window.matchMedia("(min-width: 1180px)").matches).toBe(false);
    expect(() => {
      const listener = () => {};
      query.addEventListener("change", listener);
      query.removeEventListener("change", listener);
    }).not.toThrow();
  });

  it("lets a test override matchMedia", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(window.matchMedia("(min-width: 1180px)").matches).toBe(true);
  });

  it("stubs scrolling and pointer capture", () => {
    const el = document.createElement("div");
    expect(() => el.scrollIntoView({ block: "nearest" })).not.toThrow();
    expect(el.hasPointerCapture(1)).toBe(false);
    expect(() => {
      el.setPointerCapture(1);
      el.releasePointerCapture(1);
    }).not.toThrow();
  });

  it("stubs media playback", async () => {
    const audio = document.createElement("audio");
    await expect(audio.play()).resolves.toBeUndefined();
    expect(() => {
      audio.pause();
      audio.load();
    }).not.toThrow();
  });

  it("has no canvas rendering context", () => {
    expect(document.createElement("canvas").getContext("2d")).toBeNull();
  });
});
