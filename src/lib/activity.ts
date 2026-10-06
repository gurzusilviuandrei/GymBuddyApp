// Days the member trained, for the History heatmap. A day counts when a workout was
// finished on it (the same data as the History list below the heatmap), judged by the
// phone's own calendar so daylight-saving changes and late-night workouts land on the
// right day.

/** Weeks shown in the heatmap; the query reads exactly what is displayed. */
export const HEATMAP_WEEKS = 12;

/** YYYY-MM-DD of a moment in the phone's own time zone. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The distinct local days of a list of timestamps (ISO strings), unreadable ones skipped. */
export function activityDays(timestamps: string[]): string[] {
  const days = new Set<string>();
  for (const ts of timestamps) {
    const when = new Date(ts);
    if (!Number.isNaN(when.getTime())) days.add(localDayKey(when));
  }
  return [...days];
}

/** How far back to read so every displayed week is covered (one spare week for the Monday start). */
export function heatmapLookbackMs(): number {
  return (HEATMAP_WEEKS * 7 + 7) * 86_400_000;
}
