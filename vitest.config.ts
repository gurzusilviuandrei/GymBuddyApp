import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app imports with "@/…" (see tsconfig paths); tests that touch those modules need it too.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["supabase/tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Each file boots its own in-process Postgres.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
