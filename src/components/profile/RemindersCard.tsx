import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getUserStats } from "@/lib/gym-api";
import { applyReminders, readReminderSettings, remindersSupported, saveReminderSettings } from "@/lib/native-reminders";
import {
  DAY_SHORT,
  defaultReminderSettings,
  describeReminders,
  isValidTime,
  normalizeDays,
  WEEK_ORDER,
  type ReminderSettings,
  type Weekday,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

const DENIED_TEXT = "Notifications are off for GymBuddy. Turn them on in your phone's settings (Apps → GymBuddy → Notifications), then save again.";

/** Profile: turn training-day reminders on or off and choose the days and time. */
export function RemindersCard() {
  const { data: stats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => getUserStats({ data: { tz_offset: new Date().getTimezoneOffset() } }),
  });
  const weeklyGoal = stats?.weeklyTarget ?? 3;
  const [saved, setSaved] = useState<ReminderSettings | null>(() => readReminderSettings());
  const [draft, setDraft] = useState<ReminderSettings>(() => readReminderSettings() ?? { ...defaultReminderSettings(3), enabled: false });
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const apply = async (next: ReminderSettings) => {
    setBusy(true);
    const result = await applyReminders(next, true);
    setBusy(false);
    if (result === "scheduled" || result === "off") {
      saveReminderSettings(next);
      setSaved(next);
      setDraft(next);
      setDenied(false);
      toast.success(result === "scheduled" ? `Reminders on: ${describeReminders(next)}.` : "Reminders off.");
    } else if (result === "denied") {
      setDenied(true);
      toast.error(DENIED_TEXT);
    } else {
      toast.error("Couldn't change your reminders. Try again.");
    }
  };

  const toggle = (on: boolean) => {
    // First time on: start from days that match the member's weekly goal.
    const base = on && !saved ? defaultReminderSettings(weeklyGoal) : draft;
    void apply({ ...base, enabled: on, days: on && base.days.length === 0 ? defaultReminderSettings(weeklyGoal).days : base.days });
  };

  const toggleDay = (day: Weekday) => {
    setDraft((d) => ({ ...d, days: d.days.includes(day) ? d.days.filter((x) => x !== day) : normalizeDays([...d.days, day]) }));
  };

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const canSave = draft.enabled && draft.days.length > 0 && isValidTime(draft.time) && changed && !busy;

  return (
    <section className="mt-10" aria-labelledby="reminders-title">
      <div className="flex items-center gap-3">
        <BellRing className="size-5 text-primary" aria-hidden="true" />
        <h2 id="reminders-title" className="text-lg font-semibold">Workout reminders</h2>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-5">
        {!remindersSupported ? (
          <p className="text-sm text-muted-foreground">Reminders work in the GymBuddy Android app.</p>
        ) : (
          <>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block font-medium">Remind me on training days</span>
                <span className="block text-sm text-muted-foreground">
                  {saved?.enabled ? describeReminders(saved) : "A notification on the days you choose."}
                </span>
              </span>
              <Switch checked={draft.enabled} onCheckedChange={toggle} disabled={busy} aria-label="Workout reminders" />
            </label>

            {denied && (
              <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                {DENIED_TEXT}
              </p>
            )}

            {draft.enabled && (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Days</p>
                  <div className="mt-2 grid grid-cols-7 gap-1.5" role="group" aria-label="Reminder days">
                    {WEEK_ORDER.map((day) => {
                      const on = draft.days.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleDay(day)}
                          className={cn(
                            "min-h-11 rounded-lg border-2 text-xs font-semibold transition-colors",
                            on ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground",
                          )}
                        >
                          {DAY_SHORT[day]}
                        </button>
                      );
                    })}
                  </div>
                  {draft.days.length === 0 && <p className="mt-2 text-sm text-destructive-text">Pick at least one day.</p>}
                </div>

                <div>
                  <label htmlFor="reminder-time" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Time</label>
                  <Input
                    id="reminder-time"
                    type="time"
                    value={draft.time}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                    className="mt-2 h-12 w-40 border-input bg-background text-base"
                  />
                </div>

                <Button type="button" onClick={() => void apply(draft)} disabled={!canSave} className="h-12 w-full">
                  {busy ? "Saving…" : "Save reminders"}
                </Button>
                <p className="text-xs text-muted-foreground">They may arrive a few minutes late; Android groups alarms to save battery.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
