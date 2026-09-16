import type { MeetingRepo } from "./repo/types.js";
import type { SttProvider } from "./services/stt/types.js";
import type { SummaryResult } from "./services/types.js";
import type { Storage } from "./storage/types.js";

export type AppDeps = {
  repo: MeetingRepo;
  storage: Storage;
  stt: SttProvider;
  summarize: (text: string) => Promise<SummaryResult>;
  now: () => Date;
  limits: { perIpPerHour: number; globalPerHour: number };
  log: (line: object) => void;
};
