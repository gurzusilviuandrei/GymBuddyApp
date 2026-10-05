import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Plain single-page app: everything is bundled into dist/, which Capacitor ships
// inside the Android/iOS app. There is no server; data comes from Supabase.
export default defineConfig(({ command, mode }) => {
  // A build without the Supabase settings would ship an app that shows a blank screen.
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].filter((k) => !env[k]);
  if (command === "build" && missing.length) {
    throw new Error(`Missing ${missing.join(", ")}: copy .env.example to .env and fill it in.`);
  }

  return {
    plugins: [
      // Must run before the React plugin so it can generate src/routeTree.gen.ts.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      tsconfigPaths(),
    ],
    server: { port: 5173 },
  };
});
