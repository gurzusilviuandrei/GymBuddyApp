import type { CapacitorConfig } from "@capacitor/cli";

// GymBuddy renders on the server, so the native shell loads the live site
// instead of bundling static files. Publishing updates the app instantly.
const config: CapacitorConfig = {
  appId: "app.gymbuddyapp.gymbuddy",
  appName: "GymBuddy",
  webDir: "public",
  backgroundColor: "#121212",
  server: {
    url: "https://gymbuddyapp.app",
    cleartext: false,
  },
  ios: { contentInset: "always", backgroundColor: "#121212" },
  android: { backgroundColor: "#121212" },
};

export default config;
