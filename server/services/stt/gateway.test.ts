import { gateway } from "@ai-sdk/gateway";
import { NoTranscriptGeneratedError, transcribe } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcriptionResult } from "../../test/aiSdk.js";
import { gatewayStt } from "./gateway.js";
import { SttError } from "./types.js";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  transcribe: vi.fn(),
}));

vi.mock("@ai-sdk/gateway", () => ({
  gateway: {
    transcriptionModel: vi.fn((modelId: string) => ({ modelId })),
  },
}));

const input = { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/webm" };

describe("gatewayStt", () => {
  let stt: ReturnType<typeof gatewayStt>;

  beforeEach(() => {
    vi.mocked(transcribe).mockReset();
    stt = gatewayStt("openai/whisper-1");
  });

  it("asks the gateway model for segment timestamps and maps the result", async () => {
    vi.mocked(transcribe).mockResolvedValue(transcriptionResult());

    const transcript = await stt.transcribe(input);

    expect(stt.name).toBe("gateway:openai/whisper-1");
    expect(gateway.transcriptionModel).toHaveBeenCalledWith("openai/whisper-1");
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: "openai/whisper-1" },
        audio: input.bytes,
        providerOptions: { openai: { timestampGranularities: ["segment"] } },
      }),
    );
    expect(transcript).toEqual({
      text: "We ship on Friday. Ana owns the notes.",
      segments: [
        { text: "We ship on Friday.", startSecond: 0, endSecond: 2.5 },
        { text: "Ana owns the notes.", startSecond: 2.5, endSecond: 4.25 },
      ],
      language: "en",
      durationSeconds: 4.25,
    });
  });

  it("treats the SDK's no-transcript error as silence", async () => {
    vi.mocked(transcribe).mockRejectedValue(
      new NoTranscriptGeneratedError({ responses: [] }),
    );

    expect(await stt.transcribe(input)).toEqual({ text: "", segments: [] });
  });

  it("hides provider failures behind a retryable SttError", async () => {
    const cause = new Error("502 Bad Gateway <html>");
    vi.mocked(transcribe).mockRejectedValue(cause);

    const err = await stt.transcribe(input).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SttError);
    expect(err).toMatchObject({
      code: "provider",
      retryable: true,
      message: "Speech-to-text provider failed",
      cause,
    });
  });
});
