import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { getStreakData } from "@/lib/gym-api";
import { weeklyStreak } from "@/lib/streak";

/** "3-week streak" under the weekly ring: weeks in a row with the weekly goal hit (streak.ts). */
export function StreakLine() {
  const { data } = useQuery({ queryKey: ["streak"], queryFn: getStreakData });
  if (!data) return null;
  const { current, best, thisWeek, goal } = weeklyStreak(data.completedAts, data.weeklyGoal);
  const left = Math.max(0, goal - thisWeek);

  let detail: string;
  if (current === 0 && thisWeek > 0) detail = `${left} more this week to start a streak.`;
  else if (current === 0) detail = `Hit ${goal} ${goal === 1 ? "workout" : "workouts"} this week to start a streak.`;
  else if (left > 0) detail = `${left} more this week to keep it going.`;
  else detail = best > current ? `Best ever: ${best} weeks.` : "Your best run yet. Keep it going!";

  return (
    <div className="mt-5 flex flex-col items-center gap-1 text-center" aria-live="polite">
      <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${current > 0 ? "text-primary" : "text-muted-foreground"}`}>
        <Flame className="size-4" aria-hidden="true" />
        {current > 0 ? `${current}-week streak` : "No streak yet"}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
