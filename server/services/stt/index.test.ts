import { describe, expect, it } from "vitest";
import { parseEnv } from "../../env.js";
import { createSttProvider } from "./index.js";

describe("createSttProvider", () => {
  it("builds the gateway provider with the default model", () => {
    const stt = createSttProvider(parseEnv({ STT_PROVIDER: "gateway" }));

    expect(stt.name).toBe("gateway:openai/whisper-1");
  });

  it("honours STT_MODEL for the gateway", () => {
    const stt = createSttProvider(
      parseEnv({
        STT_PROVIDER: "gateway",
        STT_MODEL: "openai/gpt-4o-transcribe",
      }),
    );

    expect(stt.name).toBe("gateway:openai/gpt-4o-transcribe");
  });

  it("builds the Groq provider when a key is set", () => {
    const stt = createSttProvider(
      parseEnv({ STT_PROVIDER: "groq", GROQ_API_KEY: "gsk_test" }),
    );

    expect(stt.name).toBe("groq:whisper-large-v3-turbo");
  });

  it("explains a missing Groq key", () => {
    expect(() =>
      createSttProvider(parseEnv({ STT_PROVIDER: "groq", GROQ_API_KEY: "" })),
    ).toThrow("GROQ_API_KEY is required when STT_PROVIDER=groq");
  });
});
