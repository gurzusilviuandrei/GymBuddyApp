import { useEffect } from "react";
import { applyReminders, readReminderSettings, remindersSupported } from "@/lib/native-reminders";

/**
 * Keeps the phone's scheduled reminders in step with the saved choice each time a member's
 * screens open: re-schedules them when they are on (never asking for permission here), and
 * cancels them when there is no choice on this phone (e.g. another account signed in and
 * the previous member's data was erased).
 */
export function ReminderSync() {
  useEffect(() => {
    if (!remindersSupported) return;
    void applyReminders(readReminderSettings(), false);
  }, []);
  return null;
}
