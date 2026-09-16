import { z } from "zod";

const envSchema = z.object({
  STT_PROVIDER: z.enum(["gateway", "groq"]).default("gateway"),
  STT_MODEL: z.string().default("openai/whisper-1"),
  GROQ_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("anthropic/claude-haiku-4.5"),
  LLM_FALLBACK_MODELS: z
    .string()
    .transform((list) =>
      list
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
    )
    .default(["google/gemini-2.5-flash"]),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  // Copies of .env.example leave unused keys empty; those mean "unset".
  const provided = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const result = envSchema.safeParse(provided);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
