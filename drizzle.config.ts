import "./server/loadEnv.js";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  // Migrations need a direct connection; the pooled URL is for runtime queries.
  // `||`, not `??`: a copied .env.example leaves unused keys empty.
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
