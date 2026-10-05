import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Plain single-page app: everything is bundled into dist/, which Capacitor ships
// inside the Android/iOS app. There is no server; data comes from Supabase.
export default defineConfig({
  plugins: [
    // Must run before the React plugin so it can generate src/routeTree.gen.ts.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: { port: 5173 },
});
