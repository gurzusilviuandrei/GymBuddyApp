import { Flame } from "lucide-react";

export type SessionSummary = {
  id: string;
  completedAt: string;
  program: "premade" | "custom";
  sets: number;
  volume: number;
  exercises: string[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function SessionCard({ session }: { session: SessionSummary }) {
  return (
    <article className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary">
            {formatDate(session.completedAt)}
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">{session.program === "custom" ? "Custom Routine" : "Pre-Made Plan"}</span>
          </p>
          <h2 className="mt-3 text-lg font-semibold">
            {session.sets} sets <span className="mx-1 text-primary">·</span> {session.exercises.length} exercises
          </h2>
          <p className="mt-2 truncate text-sm text-muted-foreground">{session.exercises.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-primary">
          <Flame size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="text-xs font-semibold">{session.volume} kg</span>
        </div>
      </div>
    </article>
  );
}
