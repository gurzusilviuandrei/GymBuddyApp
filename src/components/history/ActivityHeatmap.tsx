import { useMemo } from "react";
import { HEATMAP_WEEKS as WEEKS, localDayKey as localKey } from "@/lib/activity";

const DAY_LABELS = ["M", "", "W", "", "F", "", "S"];

// GitHub-style grid: columns are Monday-start weeks, rows are weekdays.
export function ActivityHeatmap({ days }: { days: string[] }) {
  const active = useMemo(() => new Set(days), [days]);
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + w * 7 + d);
        return { key: localKey(date), future: date > today, date };
      }),
    );
  }, []);
  const count = weeks.flat().filter((c) => active.has(c.key)).length;

  return (
    <section aria-label="Training activity" className="mt-8 rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last {WEEKS} weeks</h2>
        <p className="text-sm font-semibold text-primary">{count} training {count === 1 ? "day" : "days"}</p>
      </div>
      <div className="mt-4 flex gap-1.5">
        <div className="grid grid-rows-7 gap-1 pr-1 text-[9px] leading-none text-muted-foreground">
          {DAY_LABELS.map((l, i) => <span key={i} className="flex h-3.5 items-center">{l}</span>)}
        </div>
        <div className="grid flex-1 grid-flow-col grid-rows-7 gap-1">
          {weeks.flat().map((c) => {
            const on = active.has(c.key);
            return (
              <span
                key={c.key}
                title={`${c.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}${on ? " · trained" : ""}`}
                className={`h-3.5 rounded-[3px] ${c.future ? "bg-transparent" : on ? "bg-primary shadow-neon" : "bg-secondary"}`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
