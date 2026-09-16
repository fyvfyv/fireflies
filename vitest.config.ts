import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          test: {
            name: "client",
            environment: "jsdom",
            include: ["src/**/*.test.{ts,tsx}"],
            setupFiles: ["src/test/setup.ts"],
          },
        },
        {
          test: {
            name: "server",
            environment: "node",
            include: [
              "server/**/*.test.ts",
              "shared/**/*.test.ts",
              "scripts/**/*.test.ts",
            ],
          },
        },
      ],
      coverage: {
        provider: "v8",
        include: ["server/**", "shared/**"],
        exclude: [
          "**/*.test.ts",
          "server/test/**",
          "server/dev.ts",
          "server/index.ts",
          "server/loadEnv.ts",
          "server/db/**",
          "server/repo/drizzleRepo.ts",
        ],
      },
    },
  }),
);
