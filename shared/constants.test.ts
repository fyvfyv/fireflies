import { describe, expect, it } from "vitest";
import { extensionFor, isAllowedAudioType } from "./constants.js";

describe("isAllowedAudioType", () => {
  it.each([
    ["audio/webm;codecs=opus", true],
    ["Audio/MP4; codecs=mp4a.40.2", true],
    ["audio/x-m4a", true],
    ["video/webm", false],
    ["audio/flac", false],
    ["", false],
  ])("%s → %s", (mime, allowed) => {
    expect(isAllowedAudioType(mime)).toBe(allowed);
  });
});

describe("extensionFor", () => {
  it.each([
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/x-m4a", "m4a"],
    ["audio/mpeg", "mp3"],
  ])("%s → %s", (mime, ext) => {
    expect(extensionFor(mime)).toBe(ext);
  });

  it("throws for a type the pipeline cannot accept", () => {
    expect(() => extensionFor("video/mp4")).toThrow(/video\/mp4/);
  });
});
