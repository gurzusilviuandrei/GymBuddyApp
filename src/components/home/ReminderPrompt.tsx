import { useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyReminders, readReminderSettings, remindersSupported, saveReminderSettings } from "@/lib/native-reminders";
import { defaultReminderSettings, describeReminders } from "@/lib/reminders";

const DISMISSED_KEY = "gymbuddy-reminder-prompt";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* storage blocked: the card shows again next time */
  }
}

/**
 * A one-time offer on Home to turn on training-day reminders, until the member picks either
 * answer. Changing the days or time later is on Profile.
 */
export function ReminderPrompt({ weeklyGoal }: { weeklyGoal: number }) {
  const [hidden, setHidden] = useState(() => !remindersSupported || readReminderSettings() !== null || wasDismissed());
  const [busy, setBusy] = useState(false);
  if (hidden) return null;

  const turnOn = async () => {
    setBusy(true);
    const settings = defaultReminderSettings(weeklyGoal);
    const result = await applyReminders(settings, true);
    setBusy(false);
    if (result === "scheduled") {
      saveReminderSettings(settings);
      toast.success(`Reminders on: ${describeReminders(settings)}. Change them in Profile.`);
      setHidden(true);
    } else if (result === "denied") {
      saveReminderSettings({ ...settings, enabled: false });
      toast.error("Notifications are off for GymBuddy. Turn them on in your phone's settings, then in Profile.");
      setHidden(true);
    } else {
      toast.error("Couldn't set up reminders. Try again from Profile.");
    }
  };

  return (
    <section className="mt-10 rounded-lg border border-primary/40 bg-card p-5" aria-label="Workout reminders">
      <div className="flex items-start gap-4">
        <BellRing className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Want a nudge on training days?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We&rsquo;ll remind you {describeReminders(defaultReminderSettings(weeklyGoal))}. You can change the days and time in Profile.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={() => { rememberDismissed(); setHidden(true); }} disabled={busy}>
          Not now
        </Button>
        <Button type="button" onClick={() => void turnOn()} disabled={busy}>
          {busy ? "Setting up…" : "Remind me"}
        </Button>
      </div>
    </section>
  );
}
