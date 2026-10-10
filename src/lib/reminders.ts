// Training-day reminders: which days and at what time, and the notifications that follow from
// that. They are scheduled on the phone (native-reminders.ts) as weekly repeating notifications,
// so they keep coming even when the app is not opened for weeks. Free of React and Capacitor
// so the rules are unit-tested.

/** Day numbers as in Date.getDay(): 0 Sunday … 6 Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ReminderSettings = {
  enabled: boolean;
  /** Sorted, no repeats. */
  days: Weekday[];
  /** "HH:MM", 24-hour. */
  time: string;
};

/** Where the choice is kept on the phone (per account: erased when another account signs in). */
export const REMINDERS_KEY = "gymbuddy-reminders";

export const DEFAULT_REMINDER_TIME = "18:00";

/** Monday first, the way the week is shown everywhere else. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];
export const DAY_SHORT: Record<Weekday, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

/** Training days spread across the week for a weekly goal (1 to 7 days). */
export function defaultReminderDays(weeklyGoal: number): Weekday[] {
  const n = Number.isFinite(weeklyGoal) ? Math.min(7, Math.max(1, Math.round(weeklyGoal))) : 3;
  const byGoal: Record<number, Weekday[]> = {
    1: [3],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return byGoal[n]!;
}

export function defaultReminderSettings(weeklyGoal: number): ReminderSettings {
  return { enabled: true, days: defaultReminderDays(weeklyGoal), time: DEFAULT_REMINDER_TIME };
}

export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function isWeekday(n: unknown): n is Weekday {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
}

export function normalizeDays(days: readonly number[]): Weekday[] {
  return [...new Set(days.filter(isWeekday))].sort((a, b) => a - b);
}

/** A saved choice, or null when there is none or it is unreadable. */
export function parseReminderSettings(raw: string | null | undefined): ReminderSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReminderSettings>;
    if (typeof value.enabled !== "boolean" || !Array.isArray(value.days) || typeof value.time !== "string" || !isValidTime(value.time)) {
      return null;
    }
    return { enabled: value.enabled, days: normalizeDays(value.days), time: value.time };
  } catch {
    return null;
  }
}

/** "Mon, Wed, Fri at 18:00", in week order. */
export function describeReminders(settings: ReminderSettings): string {
  const days = WEEK_ORDER.filter((d) => settings.days.includes(d)).map((d) => DAY_SHORT[d]);
  return days.length === 7 ? `Every day at ${settings.time}` : `${days.join(", ")} at ${settings.time}`;
}

/** Notification ids 9100–9106, one per weekday, so a change replaces exactly our own. */
export const REMINDER_ID_BASE = 9100;
export const ALL_REMINDER_IDS: readonly number[] = [0, 1, 2, 3, 4, 5, 6].map((d) => REMINDER_ID_BASE + d);

const MESSAGES: Record<Weekday, { title: string; body: string }> = {
  0: { title: "Sunday session, Bro?", body: "Your next workout is ready in GymBuddy." },
  1: { title: "New week, first workout", body: "Start the week strong. Your plan is ready." },
  2: { title: "Training day", body: "Open GymBuddy and follow it set by set." },
  3: { title: "Midweek workout time", body: "Keep the streak going. Your plan is ready." },
  4: { title: "Training day", body: "Your next workout is waiting in GymBuddy." },
  5: { title: "Friday workout, Bro", body: "Finish the week strong. Your plan is ready." },
  6: { title: "Weekend workout?", body: "Your next workout is ready in GymBuddy." },
};

export type PlannedReminder = {
  id: number;
  day: Weekday;
  /** The plugin's day numbering: 1 Sunday … 7 Saturday. */
  pluginWeekday: number;
  hour: number;
  minute: number;
  title: string;
  body: string;
};

/** The weekly notifications to schedule (none when off, with no days picked, or with no choice). */
export function plannedReminders(settings: ReminderSettings | null): PlannedReminder[] {
  if (!settings?.enabled || !isValidTime(settings.time)) return [];
  const [hour, minute] = settings.time.split(":").map(Number) as [number, number];
  return normalizeDays(settings.days).map((day) => ({
    id: REMINDER_ID_BASE + day,
    day,
    pluginWeekday: day + 1,
    hour,
    minute,
    ...MESSAGES[day],
  }));
}
