import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/__tests__/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
})
