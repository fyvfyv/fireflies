import type { Env } from "../../env.js";
import { gatewayStt } from "./gateway.js";
import { groqStt } from "./groq.js";
import type { SttProvider } from "./types.js";

export function createSttProvider(env: Env): SttProvider {
  if (env.STT_PROVIDER === "gateway") return gatewayStt(env.STT_MODEL);
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required when STT_PROVIDER=groq");
  }
  return groqStt(env.GROQ_API_KEY);
}
