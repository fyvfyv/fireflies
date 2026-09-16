import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("applies defaults", () => {
    expect(parseEnv({})).toEqual({
      STT_PROVIDER: "gateway",
      STT_MODEL: "openai/whisper-1",
      LLM_MODEL: "anthropic/claude-haiku-4.5",
      LLM_FALLBACK_MODELS: ["google/gemini-2.5-flash"],
    });
  });

  it("treats empty values as unset", () => {
    expect(
      parseEnv({
        STT_PROVIDER: "",
        STT_MODEL: "",
        GROQ_API_KEY: "",
        LLM_MODEL: "",
        LLM_FALLBACK_MODELS: "",
      }),
    ).toEqual(parseEnv({}));
  });

  it("splits comma-separated fallback models", () => {
    expect(
      parseEnv({ LLM_FALLBACK_MODELS: " openai/gpt-5-mini , google/x ," })
        .LLM_FALLBACK_MODELS,
    ).toEqual(["openai/gpt-5-mini", "google/x"]);
  });

  it("names the offending variable", () => {
    expect(() => parseEnv({ STT_PROVIDER: "whisper" })).toThrow(
      /Invalid environment[\s\S]*STT_PROVIDER/,
    );
  });
});
