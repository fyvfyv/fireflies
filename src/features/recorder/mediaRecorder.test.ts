import { describe, expect, it } from "vitest";
import { FakeMediaRecorder } from "@/test/fakeMediaRecorder";
import { type RecorderCtor, supportedMimeType } from "./mediaRecorder";

const recording = (...types: string[]): RecorderCtor =>
  class extends FakeMediaRecorder {
    static isTypeSupported = (type: string) => types.includes(type);
  };

describe("supportedMimeType", () => {
  it("prefers Opus in WebM, then plain WebM, then MP4 (Safari)", () => {
    expect(
      supportedMimeType(recording("audio/mp4", "audio/webm;codecs=opus")),
    ).toBe("audio/webm;codecs=opus");
    expect(supportedMimeType(recording("audio/mp4", "audio/webm"))).toBe(
      "audio/webm",
    );
    expect(supportedMimeType(recording("audio/mp4"))).toBe("audio/mp4");
  });

  it("is undefined when nothing can be recorded", () => {
    expect(supportedMimeType(undefined)).toBeUndefined();
    expect(supportedMimeType(recording())).toBeUndefined();
  });
});
