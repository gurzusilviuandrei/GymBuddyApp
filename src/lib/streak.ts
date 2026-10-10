// The weekly streak on Home: how many weeks in a row the member hit their weekly goal
// (workouts per week from onboarding). Weeks, not days, because a beginner's plan has rest
// days built in; a daily streak would punish them. Weeks start on Monday in the phone's own
// calendar, like the weekly ring. Free of React and the server, so it is unit-tested.
import { localDayKey } from "./activity";

/** Monday 00:00 (local) of the week a moment falls in. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** "YYYY-MM-DD" of that Monday: the key of a week. */
export function weekKey(date: Date): string {
  return localDayKey(weekStart(date));
}

function previousWeek(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() - 7);
  return d;
}

export type Streak = {
  /** Weeks in a row with the goal hit. This week counts once it is hit; until then the streak from earlier weeks is still alive. */
  current: number;
  /** The longest run ever (at least `current`). */
  best: number;
  /** Workouts finished so far this week. */
  thisWeek: number;
  /** The goal used (at least 1). */
  goal: number;
};

/** `completedAts`: when each finished workout ended (ISO strings); unreadable ones are skipped. */
export function weeklyStreak(completedAts: string[], weeklyGoal: number, now: Date = new Date()): Streak {
  const goal = Math.max(1, Math.round(weeklyGoal) || 1);
  const perWeek = new Map<string, number>();
  let earliest: Date | null = null;
  for (const ts of completedAts) {
    const when = new Date(ts);
    if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime() + 60_000) continue;
    const key = weekKey(when);
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    if (!earliest || when < earliest) earliest = when;
  }
  const hit = (monday: Date) => (perWeek.get(localDayKey(monday)) ?? 0) >= goal;

  const thisMonday = weekStart(now);
  const thisWeek = perWeek.get(localDayKey(thisMonday)) ?? 0;

  let current = 0;
  for (let w = hit(thisMonday) ? thisMonday : previousWeek(thisMonday); hit(w); w = previousWeek(w)) current += 1;

  let best = 0;
  if (earliest) {
    const first = weekStart(earliest);
    let run = 0;
    for (let w = thisMonday; w >= first; w = previousWeek(w)) {
      run = hit(w) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { current, best: Math.max(best, current), thisWeek, goal };
}
