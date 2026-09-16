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
  beforeEach(() => {
    vi.mocked(transcribe).mockReset();
  });

  it("is named after the gateway model", () => {
    expect(gatewayStt("openai/whisper-1").name).toBe(
      "gateway:openai/whisper-1",
    );
    expect(gateway.transcriptionModel).toHaveBeenCalledWith("openai/whisper-1");
  });

  it("sends the audio bytes and asks for segment timestamps", async () => {
    vi.mocked(transcribe).mockResolvedValue(transcriptionResult());

    await gatewayStt("openai/whisper-1").transcribe(input);

    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: "openai/whisper-1" },
        audio: input.bytes,
        providerOptions: { openai: { timestampGranularities: ["segment"] } },
      }),
    );
  });

  it("maps the transcript, segments, language and duration", async () => {
    vi.mocked(transcribe).mockResolvedValue(transcriptionResult());

    expect(await gatewayStt("openai/whisper-1").transcribe(input)).toEqual({
      text: "We ship on Friday. Ana owns the notes.",
      segments: [
        { text: "We ship on Friday.", startSecond: 0, endSecond: 2.5 },
        { text: "Ana owns the notes.", startSecond: 2.5, endSecond: 4.25 },
      ],
      language: "en",
      durationSeconds: 4.25,
    });
  });

  it("returns an empty transcript for empty text", async () => {
    vi.mocked(transcribe).mockResolvedValue(
      transcriptionResult({
        text: "",
        segments: [],
        language: undefined,
        durationInSeconds: undefined,
      }),
    );

    expect(await gatewayStt("openai/whisper-1").transcribe(input)).toEqual({
      text: "",
      segments: [],
    });
  });

  it("treats the SDK's no-transcript error as silence", async () => {
    vi.mocked(transcribe).mockRejectedValue(
      new NoTranscriptGeneratedError({ responses: [] }),
    );

    expect(await gatewayStt("openai/whisper-1").transcribe(input)).toEqual({
      text: "",
      segments: [],
    });
  });

  it("hides provider failures behind a retryable SttError", async () => {
    const cause = new Error("502 Bad Gateway <html>");
    vi.mocked(transcribe).mockRejectedValue(cause);

    const err = await gatewayStt("openai/whisper-1")
      .transcribe(input)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SttError);
    expect(err).toMatchObject({
      code: "provider",
      retryable: true,
      message: "Speech-to-text provider failed",
      cause,
    });
  });
});
