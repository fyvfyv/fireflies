import { config } from "dotenv";

// `vercel env pull` writes .env.local, which `dotenv/config` never reads.
config({ path: [".env.local", ".env"], quiet: true });
