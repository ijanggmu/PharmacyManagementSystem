import { defineConfig } from "vitest/config"
import path from "path"

// DB-level integration tests — hit the real Postgres instance to verify triggers,
// SECURITY DEFINER functions, and RPC behavior that a mocked-Supabase unit test
// cannot see (this is exactly the class of bug that shipped silently: a BEFORE
// UPDATE trigger returning OLD instead of NEW, discarding every write to `sales`
// while reporting success — no unit test could have caught that, only a real
// connection could). Run with `yarn test:integration`; requires
// SUPABASE_DB_URL or POSTGRES_URL_NON_POOLING in the environment.
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
