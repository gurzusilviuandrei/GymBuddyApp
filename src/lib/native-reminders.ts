// Schedules and cancels the training-day reminders on the phone (rules in reminders.ts).
// Weekly repeating local notifications, deliberately not exact: a reminder a few minutes
// late is fine, and asking for exact alarms would open Android's "Alarms & reminders"
// settings screen (the plugin does that by default for exact ones).
import { LocalNotifications } from "@capacitor/local-notifications";
import { durableStorage } from "./durable-storage";
import { isNativeApp } from "./platform";
import { ALL_REMINDER_IDS, parseReminderSettings, plannedReminders, REMINDERS_KEY, type ReminderSettings } from "./reminders";

export const REMINDER_CHANNEL = "workout-reminders";

export const remindersSupported = isNativeApp;

export function readReminderSettings(): ReminderSettings | null {
  return parseReminderSettings(durableStorage.getItem(REMINDERS_KEY));
}

export function saveReminderSettings(settings: ReminderSettings): void {
  durableStorage.setItem(REMINDERS_KEY, JSON.stringify(settings));
}

export async function cancelReminders(): Promise<void> {
  if (!isNativeApp) return;
  try {
    await LocalNotifications.cancel({ notifications: ALL_REMINDER_IDS.map((id) => ({ id })) });
  } catch {
    /* nothing scheduled, or the plugin is unavailable */
  }
}

export type ApplyResult = "scheduled" | "off" | "denied" | "unsupported" | "failed";

/**
 * Replace our reminders with the ones `settings` asks for. With `askPermission` false (the
 * silent re-sync at start-up) it never shows the permission dialog: it only schedules when
 * notifications are already allowed.
 */
export async function applyReminders(settings: ReminderSettings | null, askPermission: boolean): Promise<ApplyResult> {
  if (!isNativeApp) return "unsupported";
  await cancelReminders();
  const planned = plannedReminders(settings);
  if (planned.length === 0) return "off";
  try {
    let permission = (await LocalNotifications.checkPermissions()).display;
    if (permission !== "granted" && askPermission) permission = (await LocalNotifications.requestPermissions()).display;
    if (permission !== "granted") return "denied";
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: "Workout reminders",
      description: "A nudge on the training days you chose",
      importance: 3,
    });
    await LocalNotifications.schedule({
      notifications: planned.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        channelId: REMINDER_CHANNEL,
        smallIcon: "ic_stat_gymbuddy",
        iconColor: "#39FF14",
        isExactNotification: false,
        schedule: { on: { weekday: p.pluginWeekday, hour: p.hour, minute: p.minute }, allowWhileIdle: true },
      })),
    });
    return "scheduled";
  } catch {
    return "failed";
  }
}
