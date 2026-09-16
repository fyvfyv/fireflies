import { describe, expect, it } from "vitest";
import { extensionFor, isAllowedAudioType } from "./constants.js";

describe("isAllowedAudioType", () => {
  it.each([
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/mp4",
    "Audio/MP4; codecs=mp4a.40.2",
    "audio/x-m4a",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
  ])("allows %s", (mime) => {
    expect(isAllowedAudioType(mime)).toBe(true);
  });

  it.each(["video/webm", "video/mp4", "audio/flac", "text/plain", ""])(
    "rejects %s",
    (mime) => {
      expect(isAllowedAudioType(mime)).toBe(false);
    },
  );
});

describe("extensionFor", () => {
  it.each([
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/x-m4a", "m4a"],
    ["audio/mpeg", "mp3"],
    ["audio/wav", "wav"],
    ["audio/ogg", "ogg"],
  ])("%s → %s", (mime, ext) => {
    expect(extensionFor(mime)).toBe(ext);
  });

  it("throws for a type the pipeline cannot accept", () => {
    expect(() => extensionFor("video/mp4")).toThrow(/video\/mp4/);
  });
});
