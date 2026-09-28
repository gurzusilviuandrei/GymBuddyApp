import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getSessionDetail } from "@/lib/gym.functions";
import type { SessionSummary } from "@/components/SessionCard";

export function SessionDetailSheet({ session, onClose }: { session: SessionSummary | null; onClose: () => void }) {
  const fetchDetail = useServerFn(getSessionDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["session-detail", session?.id],
    queryFn: () => fetchDetail({ data: { session_id: session!.id } }),
    enabled: Boolean(session),
  });

  return (
    <Sheet open={Boolean(session)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[100dvh] overflow-y-auto border-border bg-background px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-10">
        <div className="mx-auto w-full max-w-lg">
          <SheetHeader className="text-left">
            <p className="text-xs font-semibold uppercase text-primary">
              {session ? new Date(session.completedAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
            </p>
            <SheetTitle className="text-2xl">{session?.program === "custom" ? "Custom Routine" : "Pre-Made Plan"}</SheetTitle>
            <SheetDescription>
              {session?.sets} sets · {session?.volume} kg total volume
            </SheetDescription>
          </SheetHeader>

          <div className="mt-8 space-y-4">
            {isLoading && <p className="text-sm text-muted-foreground">Loading every set…</p>}
            {!isLoading && data?.length === 0 && <p className="text-sm text-muted-foreground">No set details were found for this workout.</p>}
            {data?.map((ex) => (
              <section key={ex.exercise_id} className="rounded-lg border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 font-semibold text-foreground">{ex.name}</h3>
                <ul className="divide-y divide-border">
                  {ex.sets.map((s) => (
                    <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-muted-foreground">Set {s.set_number}</span>
                      <span className="tabular-nums text-foreground">
                        {s.weight_kg} kg <span className="text-primary">×</span> {s.reps} reps
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
