import { createGroq } from "@ai-sdk/groq";
import { transcribe } from "ai";
import { describe, expect, it, vi } from "vitest";
import { transcriptionResult } from "../../test/aiSdk.js";
import { groqStt } from "./groq.js";

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  transcribe: vi.fn(),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => ({
    transcription: (modelId: string) => ({ modelId }),
  })),
}));

describe("groqStt", () => {
  it("asks whisper-large-v3-turbo for verbose JSON with segments", async () => {
    vi.mocked(transcribe).mockResolvedValue(transcriptionResult());
    const bytes = new Uint8Array([1, 2, 3]);

    const stt = groqStt("gsk_test");
    await stt.transcribe({ bytes, contentType: "audio/mp4" });

    expect(stt.name).toBe("groq:whisper-large-v3-turbo");
    expect(createGroq).toHaveBeenCalledWith({ apiKey: "gsk_test" });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: "whisper-large-v3-turbo" },
        audio: bytes,
        providerOptions: {
          groq: {
            responseFormat: "verbose_json",
            timestampGranularities: ["segment"],
          },
        },
      }),
    );
  });
});
