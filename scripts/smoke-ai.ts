import "../server/loadEnv.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseEnv } from "../server/env.js";
import { hasWords } from "../server/pipeline/processMeeting.js";
import { createSttProvider } from "../server/services/stt/index.js";
import { summarizeTranscript } from "../server/services/summarize.js";
import {
  ALLOWED_AUDIO_TYPES,
  extensionFor,
  MIN_TRANSCRIPT_WORDS,
} from "../shared/constants.js";

const DEFAULT_SAMPLE = "public/samples/standup.webm";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const file =
  process.argv[2] ?? (existsSync(DEFAULT_SAMPLE) ? DEFAULT_SAMPLE : undefined);
if (!file) {
  fail(
    `Usage: pnpm smoke:ai <audio file>\n(defaults to ${DEFAULT_SAMPLE} once it exists)`,
  );
}
if (!existsSync(file)) fail(`File not found: ${file}`);

// `vercel env pull` writes VERCEL_OIDC_TOKEN, which the gateway accepts too.
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  fail(
    "Missing AI Gateway credentials: set AI_GATEWAY_API_KEY in .env.local or run `vercel env pull .env.local`.",
  );
}

function loadConfig() {
  try {
    const env = parseEnv();
    return { env, stt: createSttProvider(env) };
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
const { env, stt } = loadConfig();

const bytes = new Uint8Array(await readFile(file));
const ext = extname(file).slice(1).toLowerCase();
const contentType =
  ALLOWED_AUDIO_TYPES.find((type) => extensionFor(type) === ext) ??
  fail(`Unsupported audio extension: .${ext}`);

let started = Date.now();
const transcript = await stt.transcribe({ bytes, contentType });
const transcribeMs = Date.now() - started;

started = Date.now();
const summary = hasWords(transcript.text, MIN_TRANSCRIPT_WORDS)
  ? await summarizeTranscript(
      { text: transcript.text, segments: transcript.segments },
      { model: env.LLM_MODEL, fallbackModels: env.LLM_FALLBACK_MODELS },
    )
  : null;
const summarizeMs = Date.now() - started;

console.log(
  JSON.stringify(
    {
      file,
      contentType,
      sttProvider: stt.name,
      transcribeMs,
      transcript,
      summarizeMs,
      summary: summary ?? `skipped: fewer than ${MIN_TRANSCRIPT_WORDS} words`,
    },
    null,
    2,
  ),
);
