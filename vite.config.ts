import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "@shared": fromRoot("./shared"),
      "@tw": fromRoot("./src/twMerge.ts"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
