import { createGroq } from "@ai-sdk/groq";
import { transcribe } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcriptionResult } from "../../test/aiSdk.js";
import { groqStt } from "./groq.js";
import { SttError } from "./types.js";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  transcribe: vi.fn(),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => ({
    transcription: (modelId: string) => ({ modelId }),
  })),
}));

const input = { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/mp4" };

describe("groqStt", () => {
  beforeEach(() => {
    vi.mocked(transcribe).mockReset();
  });

  it("uses whisper-large-v3-turbo with the given key", async () => {
    vi.mocked(transcribe).mockResolvedValue(transcriptionResult());

    const stt = groqStt("gsk_test");
    await stt.transcribe(input);

    expect(stt.name).toBe("groq:whisper-large-v3-turbo");
    expect(createGroq).toHaveBeenCalledWith({ apiKey: "gsk_test" });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: "whisper-large-v3-turbo" },
        audio: input.bytes,
        providerOptions: {
          groq: {
            responseFormat: "verbose_json",
            timestampGranularities: ["segment"],
          },
        },
      }),
    );
  });

  // The SDK reports missing Groq segments as an empty list.
  it("keeps the text when Groq returns no segments", async () => {
    vi.mocked(transcribe).mockResolvedValue(
      transcriptionResult({ segments: [] }),
    );

    const transcript = await groqStt("gsk_test").transcribe(input);

    expect(transcript.segments).toEqual([]);
    expect(transcript.text).toBe("We ship on Friday. Ana owns the notes.");
  });

  it("hides provider failures behind a retryable SttError", async () => {
    vi.mocked(transcribe).mockRejectedValue(
      new Error("502 Bad Gateway <html>"),
    );

    const err = await groqStt("gsk_test")
      .transcribe(input)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SttError);
    expect(err).toMatchObject({
      code: "provider",
      retryable: true,
      message: "Speech-to-text provider failed",
    });
  });
});
