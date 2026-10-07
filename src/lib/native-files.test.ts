import { describe, expect, it } from "vitest";
import { isSharedFileName } from "./native-files";

describe("which cache files are ours to clean up", () => {
  it("matches the Bro Card and data export names the app writes", () => {
    for (const name of [
      "gymbuddy-bro-card.png",
      "gymbuddy-bro-card-2026-10-07.png",
      "gymbuddy-training-history-2026-10-07.json",
    ]) expect(isSharedFileName(name)).toBe(true);
  });

  it("leaves everything else in the cache alone", () => {
    for (const name of ["sentry", "oat_primary", "gymbuddy-other.png", "my-gymbuddy-bro-card.png", "gymbuddy-bro-card.png.bak", "gymbuddy-training-history.txt", "../gymbuddy-bro-card.png", ""]) {
      expect(isSharedFileName(name)).toBe(false);
    }
  });
});
