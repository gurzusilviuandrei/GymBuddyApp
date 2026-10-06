import { describe, expect, it } from "vitest";
import { activityDays, heatmapLookbackMs, HEATMAP_WEEKS, localDayKey } from "./activity";

describe("heatmap days", () => {
  it("names a moment by the phone's own calendar day (late evenings stay on their day)", () => {
    // Built from local parts, so the answer doesn't depend on the machine's time zone.
    expect(localDayKey(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(localDayKey(new Date(2026, 9, 6, 0, 1))).toBe("2026-10-06");
    expect(localDayKey(new Date(2026, 0, 3, 12))).toBe("2026-01-03");
  });

  it("keeps the right day across a daylight-saving change", () => {
    for (const [y, m, d] of [
      [2026, 2, 29],
      [2026, 9, 25],
      [2026, 2, 8],
      [2026, 10, 1],
    ] as const) {
      expect(localDayKey(new Date(y, m, d, 0, 30))).toBe(localDayKey(new Date(y, m, d, 23, 30)));
    }
  });

  it("turns finished-workout times into distinct days, ignoring unreadable ones", () => {
    const iso = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString();
    const days = activityDays([
      iso(2026, 9, 5, 9),
      iso(2026, 9, 5, 18), // a second workout the same day
      iso(2026, 9, 3, 7),
      "not a date",
    ]);
    expect(days.sort()).toEqual(["2026-10-03", "2026-10-05"]);
  });

  it("reads exactly the weeks the heatmap shows, plus one spare", () => {
    expect(HEATMAP_WEEKS).toBe(12);
    expect(heatmapLookbackMs()).toBe(13 * 7 * 86_400_000);
  });
});
