import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getExerciseProgress } from "@/lib/gym-api";

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// Best estimated 1RM per training day across the trailing 8 weeks.
export function ExerciseProgressChart({ exerciseId }: { exerciseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["exercise-progress", exerciseId],
    queryFn: () => getExerciseProgress({ data: { exercise_id: exerciseId, tz_offset: new Date().getTimezoneOffset() } }),
  });

  if (isLoading) return <p className="py-6 text-center text-xs text-muted-foreground">Loading your progress…</p>;
  if (!data || data.length === 0)
    return <p className="py-6 text-center text-xs text-muted-foreground">No sets logged in the last 8 weeks. Log one and your graph starts here.</p>;

  const first = data[0]!;
  const last = data[data.length - 1]!;
  const gain = Math.round((last.e1rm - first.e1rm) * 10) / 10;

  return (
    <div className="pt-3">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Est. 1RM · 8 weeks</p>
        <p className="text-sm font-semibold text-primary">
          {last.e1rm} kg {data.length > 1 && <span className="text-xs text-muted-foreground">({gain >= 0 ? "+" : ""}{gain} kg)</span>}
        </p>
      </div>
      <div className="mt-2 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} domain={["dataMin - 5", "dataMax + 5"]} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => shortDate(String(d))}
              formatter={(v, _n, p) => [`${v} kg (${p.payload.weight} kg × ${p.payload.reps})`, "Est. 1RM"]}
            />
            <Line type="monotone" dataKey="e1rm" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
