import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Each file boots its own in-process Postgres.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
