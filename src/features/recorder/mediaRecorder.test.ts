import { describe, expect, it } from "vitest";
import { type RecorderCtor, supportedMimeType } from "./mediaRecorder";

function recorderSupporting(check: (type: string) => boolean): RecorderCtor {
  return class extends EventTarget {
    static isTypeSupported = check;
    state = "inactive";
    start() {}
    stop() {}
  };
}

describe("supportedMimeType", () => {
  it("is undefined without a MediaRecorder", () => {
    expect(supportedMimeType(undefined)).toBeUndefined();
  });

  it("prefers Opus in WebM", () => {
    expect(supportedMimeType(recorderSupporting(() => true))).toBe(
      "audio/webm;codecs=opus",
    );
  });

  it("falls back to plain WebM, then MP4 (Safari)", () => {
    expect(
      supportedMimeType(recorderSupporting((type) => type === "audio/webm")),
    ).toBe("audio/webm");
    expect(
      supportedMimeType(recorderSupporting((type) => type === "audio/mp4")),
    ).toBe("audio/mp4");
  });

  it("is undefined when nothing is supported", () => {
    expect(supportedMimeType(recorderSupporting(() => false))).toBeUndefined();
  });
});
