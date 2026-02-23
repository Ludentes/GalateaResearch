import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./app/test/setup.ts"],
    exclude: ["node_modules", "e2e", "docs/archive"],
    // Ollama tests must run sequentially — the 29.9B model can only serve
    // one request at a time, so parallel test files cause timeouts.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
})
