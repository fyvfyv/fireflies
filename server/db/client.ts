import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export function createDb(url: string) {
  return drizzle({ client: neon(url) });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | undefined;

// Lazy so importing the app (tests, health check) never needs DATABASE_URL.
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = createDb(url);
  }
  return db;
}
