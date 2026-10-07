import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { SessionCard } from "@/components/SessionCard";
import { Button } from "@/components/ui/button";
import { canShowOlder, HISTORY_PAGE, nextHistoryLimit } from "@/lib/history-paging";
import { BottomNav } from "@/components/BottomNav";
import { useState } from "react";
import { deleteWorkoutSession, getActivityDays, getWorkoutHistory } from "@/lib/gym-api";
import { ActivityHeatmap } from "@/components/history/ActivityHeatmap";
import { SessionDetailSheet } from "@/components/history/SessionDetailSheet";
import type { SessionSummary } from "@/components/SessionCard";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});


function HistoryPage() {
  const queryClient = useQueryClient();
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null);
  const { data: activeDays } = useQuery({
    queryKey: ["workout-history", "activity"],
    queryFn: () => getActivityDays(),
  });
  // The newest 100 first; "Show older workouts" asks for 100 more.
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const { data: sessions, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["workout-history", "list", limit],
    queryFn: () => getWorkoutHistory({ data: { limit } }),
    // Keep the workouts already on screen while the longer list loads.
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => deleteWorkoutSession({ data: { session_id: sessionId } }),
    onSuccess: async () => {
      // The weekly ring counts sessions since Monday, so refreshing stats deducts it.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workout-history"] }),
        queryClient.invalidateQueries({ queryKey: ["user-stats"] }),
      ]);
      toast.success("Workout deleted");
    },
    onError: () => toast.error("Could not delete that workout. Try again, Bro."),
  });

  return (
    <>
      <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-32 pt-12 text-foreground">
        <header>
          <p className="text-xs font-semibold uppercase text-primary">Your training log</p>
          <h1 className="mt-3 text-3xl font-semibold">History</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Every workout you have finished, newest first.
          </p>
        </header>
        <ActivityHeatmap days={activeDays ?? []} />

        <section className="mt-10 space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your sessions…</p>}

          {isError && !sessions && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
              <span>Couldn't load your workouts. Check your signal.</span>
              <button type="button" onClick={() => void refetch()} className="font-semibold text-primary">Retry</button>
            </div>
          )}

          {!isLoading && !isError && (!sessions || sessions.length === 0) && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
                <CalendarDays size={22} strokeWidth={1.7} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">No workouts yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Finish your first workout and it will show up right here.
              </p>
            </div>
          )}

          {sessions?.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onDelete={(id) => deleteMutation.mutate(id)}
              onOpen={setOpenSession}
              deleting={deleteMutation.isPending && deleteMutation.variables === session.id}
            />
          ))}

          {sessions && canShowOlder(sessions.length, limit) && (
            <Button type="button" variant="outline" disabled={isFetching} onClick={() => setLimit(nextHistoryLimit(limit))} className="h-12 w-full rounded-lg">
              {isFetching ? "Loading…" : "Show older workouts"}
            </Button>
          )}
        </section>
      </main>
      <SessionDetailSheet session={openSession} onClose={() => setOpenSession(null)} />
      <BottomNav />
    </>
  );
}
