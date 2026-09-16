import { describe, expect, it } from "vitest";
import { parseEnv } from "../../env.js";
import { createSttProvider } from "./index.js";

describe("createSttProvider", () => {
  it.each([
    [{}, "gateway:openai/whisper-1"],
    [
      { STT_MODEL: "openai/gpt-4o-transcribe" },
      "gateway:openai/gpt-4o-transcribe",
    ],
    [
      { STT_PROVIDER: "groq", GROQ_API_KEY: "gsk_test" },
      "groq:whisper-large-v3-turbo",
    ],
  ])("builds the provider for %j", (env, name) => {
    expect(createSttProvider(parseEnv(env)).name).toBe(name);
  });

  it("explains a missing Groq key", () => {
    expect(() =>
      createSttProvider(parseEnv({ STT_PROVIDER: "groq", GROQ_API_KEY: "" })),
    ).toThrow("GROQ_API_KEY is required when STT_PROVIDER=groq");
  });
});
