import { vi } from "vitest";
import type { Summary } from "../../shared/schemas.js";
import type { AppDeps } from "../deps.js";
import { memoryRepo } from "../repo/memoryRepo.js";
import type { Transcript } from "../services/stt/types.js";
import { memoryStorage } from "../storage/memoryStorage.js";

export const stubTranscript: Transcript = {
  text: "We agreed to ship the release on Friday and Ana owns the notes.",
  segments: [
    {
      text: "We agreed to ship the release on Friday",
      startSecond: 0,
      endSecond: 3.5,
    },
    { text: "and Ana owns the notes.", startSecond: 3.5, endSecond: 5.2 },
  ],
  language: "en",
  durationSeconds: 5.2,
};

export const stubSummary: Summary = {
  title: "Release planning",
  overview: "The team agreed on the release date.",
  keyTakeaways: ["Release is on Friday"],
  decisions: ["Ship on Friday"],
  actionItems: [{ task: "Write the notes", owner: "Ana", due: null }],
};

export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  // The repo shares the app clock so rate-limit windows and leases line up.
  const now = overrides.now ?? (() => new Date("2026-09-16T12:00:00Z"));
  return {
    repo: memoryRepo(now),
    storage: memoryStorage(),
    stt: {
      name: "stub:stt",
      transcribe: vi.fn(async () => structuredClone(stubTranscript)),
    },
    summarize: vi.fn(async () => ({
      summary: structuredClone(stubSummary),
      model: "stub:llm",
      truncated: false,
    })),
    now,
    log: () => {},
    limits: { perIpPerHour: 10, globalPerHour: 30 },
    ...overrides,
  };
}
