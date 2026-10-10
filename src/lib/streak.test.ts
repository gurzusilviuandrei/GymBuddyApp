import { describe, expect, it } from "vitest";
import { weekKey, weeklyStreak } from "./streak";

// Local times: the streak follows the phone's calendar.
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).toISOString();
// Wednesday 15 October 2026, 12:00.
const NOW = new Date(2026, 9, 15, 12);

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekKey(new Date(2026, 9, 12, 0, 1))).toBe("2026-10-12"); // Monday
    expect(weekKey(new Date(2026, 9, 18, 23, 59))).toBe("2026-10-12"); // Sunday night
    expect(weekKey(new Date(2026, 9, 19, 0, 1))).toBe("2026-10-19"); // next Monday
  });

  it("are counted correctly across the clock change at the end of October", () => {
    expect(weekKey(new Date(2026, 9, 25, 12))).toBe("2026-10-19");
    expect(weekKey(new Date(2026, 9, 26, 12))).toBe("2026-10-26");
  });
});

describe("the weekly streak", () => {
  it("is zero with no workouts", () => {
    expect(weeklyStreak([], 3, NOW)).toEqual({ current: 0, best: 0, thisWeek: 0, goal: 3 });
  });

  it("counts weeks in a row that hit the goal, and stays alive while this week is in progress", () => {
    const done = [
      at(2026, 9, 29), at(2026, 10, 1), at(2026, 10, 3), // week of 28 Sep: 3
      at(2026, 10, 6), at(2026, 10, 8), at(2026, 10, 10), // week of 5 Oct: 3
      at(2026, 10, 13), // this week: 1 so far
    ];
    expect(weeklyStreak(done, 3, NOW)).toEqual({ current: 2, best: 2, thisWeek: 1, goal: 3 });
  });

  it("adds this week as soon as it is hit", () => {
    const done = [at(2026, 10, 6), at(2026, 10, 8), at(2026, 10, 12), at(2026, 10, 14)];
    expect(weeklyStreak(done, 2, NOW).current).toBe(2);
  });

  it("breaks after a missed week, but remembers the best run", () => {
    const done = [
      at(2026, 9, 14), at(2026, 9, 16), // 14 Sep: hit
      at(2026, 9, 21), at(2026, 9, 23), // 21 Sep: hit
      at(2026, 9, 28), at(2026, 9, 30), // 28 Sep: hit
      at(2026, 10, 7), // 5 Oct: missed (1 of 2)
      at(2026, 10, 13), at(2026, 10, 14), // this week: hit
    ];
    expect(weeklyStreak(done, 2, NOW)).toMatchObject({ current: 1, best: 3 });
  });

  it("is gone once a whole week was missed", () => {
    const done = [at(2026, 9, 29), at(2026, 10, 1)]; // 28 Sep hit, 5 Oct nothing
    expect(weeklyStreak(done, 2, NOW)).toMatchObject({ current: 0, best: 1 });
  });

  it("counts extra workouts in a week only once toward the streak", () => {
    const done = [at(2026, 10, 6), at(2026, 10, 7), at(2026, 10, 8), at(2026, 10, 9), at(2026, 10, 10)];
    expect(weeklyStreak(done, 2, NOW)).toMatchObject({ current: 1, best: 1 });
  });

  it("ignores unreadable and future dates, and treats a bad goal as 1", () => {
    expect(weeklyStreak(["nonsense", at(2026, 12, 1)], 3, NOW)).toEqual({ current: 0, best: 0, thisWeek: 0, goal: 3 });
    expect(weeklyStreak([at(2026, 10, 13)], 0, NOW)).toMatchObject({ current: 1, goal: 1 });
  });
});
