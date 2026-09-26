import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Flame } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { getWorkoutHistory } from "@/lib/gym.functions";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Workout History — GymBuddy" },
      { name: "description", content: "Look back at every GymBuddy session you have completed." },
      { property: "og:title", content: "Workout History — GymBuddy" },
      { property: "og:description", content: "Look back at every GymBuddy session you have completed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});


function HistoryPage() {
  const fetchHistory = useServerFn(getWorkoutHistory);
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["workout-history"],
    queryFn: () => fetchHistory({ data: {} }),
  });

  return (
    <>
      <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-32 pt-12 text-foreground">
        <header>
          <p className="text-xs font-semibold uppercase text-primary">Your training log</p>
          <h1 className="mt-3 text-3xl font-semibold">History</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Every session you have logged, newest first.
          </p>
        </header>

        <section className="mt-10 space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading your sessions…</p>}

          {!isLoading && (!sessions || sessions.length === 0) && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
                <CalendarDays size={22} strokeWidth={1.7} aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">No workouts yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Log your first set and your sessions will show up right here.
              </p>
            </div>
          )}

          {sessions?.map((session) => <SessionCard key={session.id} session={session} />)}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
