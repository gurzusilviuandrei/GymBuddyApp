import type { CapacitorConfig } from "@capacitor/cli";

// The app ships its own bundled copy of the UI (dist/, built with `npm run build`)
// and talks to Supabase directly, so it starts without a connection and needs no server.
const config: CapacitorConfig = {
  appId: "app.gymbuddyapp.gymbuddy",
  appName: "GymBuddy",
  webDir: "dist",
  backgroundColor: "#121212",
  // Never echo plugin calls to the device log: they include the login session.
  loggingBehavior: "none",
  plugins: {
    // Light status-bar icons to match the always-dark UI.
    SystemBars: { style: "DARK" },
  },
  ios: { contentInset: "always", backgroundColor: "#121212" },
  android: { backgroundColor: "#121212" },
};

export default config;
