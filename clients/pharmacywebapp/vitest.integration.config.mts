import { defineConfig } from "vitest/config"
import path from "path"

// Integration tests (no suites currently exist; the Supabase/Postgres-backed
// suite was removed with the legacy backend). Run with `yarn test:integration`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
