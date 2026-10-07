import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getExerciseProgress } from "@/lib/gym-api";
import { useWeightUnit } from "@/lib/use-weight-unit";
import { kgToUnit } from "@/lib/weight-units";

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// Best estimated 1RM per training day across the trailing 8 weeks.
export function ExerciseProgressChart({ exerciseId }: { exerciseId: string }) {
  const unit = useWeightUnit();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["exercise-progress", exerciseId],
    queryFn: () => getExerciseProgress({ data: { exercise_id: exerciseId, tz_offset: new Date().getTimezoneOffset() } }),
  });

  if (isLoading) return <p className="py-6 text-center text-xs text-muted-foreground">Loading your progress…</p>;
  // A failed load must not read as "you logged nothing". (A copy saved on the phone still draws the graph.)
  if (isError && !data)
    return (
      <div role="alert" className="py-6 text-center text-xs text-muted-foreground">
        <p>Couldn't load your progress. Check your signal and try again.</p>
        <button type="button" onClick={() => void refetch()} className="mt-2 font-semibold text-primary underline-offset-2 hover:underline">Try again</button>
      </div>
    );
  if (!data || data.length === 0)
    return <p className="py-6 text-center text-xs text-muted-foreground">No sets logged in the last 8 weeks. Log one and your graph starts here.</p>;

  // The server sends kilograms; the graph is drawn in the member's unit.
  const points = data.map((p) => ({ ...p, e1rm: kgToUnit(Number(p.e1rm), unit), weight: kgToUnit(Number(p.weight), unit) }));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const gain = Math.round((last.e1rm - first.e1rm) * 10) / 10;
  const pad = unit === "kg" ? 5 : 10;

  return (
    <div className="pt-3">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Est. 1RM · 8 weeks</p>
        <p className="text-sm font-semibold text-primary">
          {last.e1rm} {unit} {points.length > 1 && <span className="text-xs text-muted-foreground">({gain >= 0 ? "+" : ""}{gain} {unit})</span>}
        </p>
      </div>
      <div className="mt-2 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} domain={[`dataMin - ${pad}`, `dataMax + ${pad}`]} />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => shortDate(String(d))}
              formatter={(v, _n, p) => [`${v} ${unit} (${p.payload.weight} ${unit} × ${p.payload.reps})`, "Est. 1RM"]}
            />
            <Line type="monotone" dataKey="e1rm" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
