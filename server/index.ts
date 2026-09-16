import { createApp } from "./app.js";
import { getDb } from "./db/client.js";
import { parseEnv } from "./env.js";
import { drizzleRepo } from "./repo/drizzleRepo.js";
import { createSttProvider } from "./services/stt/index.js";
import { summarizeTranscript } from "./services/summarize.js";
import { blobStorage } from "./storage/blobStorage.js";

const env = parseEnv();
const llm = { model: env.LLM_MODEL, fallbackModels: env.LLM_FALLBACK_MODELS };

export const app = createApp({
  repo: drizzleRepo(getDb),
  storage: blobStorage(),
  stt: createSttProvider(env),
  summarize: (text) => summarizeTranscript(text, llm),
  now: () => new Date(),
  log: (line) => console.log(JSON.stringify(line)),
  limits: { perIpPerHour: 10, globalPerHour: 30 },
});
