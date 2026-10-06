import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Integration tests hit the real Postgres DB (see vitest.integration.config.mts)
    // and need SUPABASE_DB_URL/POSTGRES_URL_NON_POOLING — excluded from the default
    // `yarn test` run so it stays runnable with zero DB access (CI, fresh clone).
    exclude: ["node_modules", ".next", "backend/**", "**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/server/services/**", "lib/utils/validation.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
