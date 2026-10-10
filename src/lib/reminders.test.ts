import { describe, expect, it } from "vitest";
import {
  ALL_REMINDER_IDS,
  defaultReminderDays,
  defaultReminderSettings,
  describeReminders,
  isValidTime,
  parseReminderSettings,
  plannedReminders,
} from "./reminders";

describe("default training days", () => {
  it("spread the weekly goal across the week", () => {
    expect(defaultReminderDays(2)).toEqual([1, 4]); // Mon, Thu
    expect(defaultReminderDays(3)).toEqual([1, 3, 5]); // Mon, Wed, Fri
    expect(defaultReminderDays(4)).toEqual([1, 2, 4, 5]);
    expect(defaultReminderDays(7)).toHaveLength(7);
  });

  it("cope with a missing or odd goal", () => {
    expect(defaultReminderDays(Number.NaN)).toEqual([1, 3, 5]);
    expect(defaultReminderDays(12)).toHaveLength(7);
    expect(defaultReminderDays(0)).toEqual([3]);
  });

  it("start switched on at 18:00", () => {
    expect(defaultReminderSettings(3)).toEqual({ enabled: true, days: [1, 3, 5], time: "18:00" });
  });
});

describe("the reminder time", () => {
  it("accepts 24-hour HH:MM only", () => {
    for (const t of ["00:00", "07:30", "18:00", "23:59"]) expect(isValidTime(t), t).toBe(true);
    for (const t of ["24:00", "7:30", "18:60", "18", "", "6pm"]) expect(isValidTime(t), t).toBe(false);
  });
});

describe("the saved choice", () => {
  it("reads back what was saved, tidying the days", () => {
    expect(parseReminderSettings(JSON.stringify({ enabled: true, days: [5, 1, 1, 3], time: "07:15" }))).toEqual({
      enabled: true,
      days: [1, 3, 5],
      time: "07:15",
    });
  });

  it("is null when missing or unreadable", () => {
    expect(parseReminderSettings(null)).toBeNull();
    expect(parseReminderSettings("not json")).toBeNull();
    expect(parseReminderSettings(JSON.stringify({ enabled: true, days: [1], time: "25:00" }))).toBeNull();
    expect(parseReminderSettings(JSON.stringify({ enabled: "yes", days: [1], time: "18:00" }))).toBeNull();
  });

  it("drops day numbers that do not exist", () => {
    expect(parseReminderSettings(JSON.stringify({ enabled: true, days: [1, 9, -1, 2.5], time: "18:00" }))?.days).toEqual([1]);
  });

  it("is described in week order", () => {
    expect(describeReminders({ enabled: true, days: [0, 1, 3], time: "18:00" })).toBe("Mon, Wed, Sun at 18:00");
    expect(describeReminders({ enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time: "06:30" })).toBe("Every day at 06:30");
  });
});

describe("the notifications to schedule", () => {
  it("are one weekly notification per chosen day, at the chosen time", () => {
    const planned = plannedReminders({ enabled: true, days: [1, 3, 5], time: "18:30" });
    expect(planned.map((p) => [p.id, p.pluginWeekday, p.hour, p.minute])).toEqual([
      [9101, 2, 18, 30],
      [9103, 4, 18, 30],
      [9105, 6, 18, 30],
    ]);
    expect(planned.every((p) => p.title.length > 0 && p.body.length > 0)).toBe(true);
  });

  it("number Sunday as the plugin's 1", () => {
    expect(plannedReminders({ enabled: true, days: [0], time: "09:00" })[0]).toMatchObject({ id: 9100, pluginWeekday: 1 });
  });

  it("are none when off, with no days, or with no choice", () => {
    expect(plannedReminders({ enabled: false, days: [1, 3], time: "18:00" })).toEqual([]);
    expect(plannedReminders({ enabled: true, days: [], time: "18:00" })).toEqual([]);
    expect(plannedReminders(null)).toEqual([]);
  });

  it("only ever use our own seven notification ids", () => {
    expect(ALL_REMINDER_IDS).toEqual([9100, 9101, 9102, 9103, 9104, 9105, 9106]);
    const all = plannedReminders({ enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time: "18:00" });
    expect(all.map((p) => p.id)).toEqual([...ALL_REMINDER_IDS]);
  });
});
