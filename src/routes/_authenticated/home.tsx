import { useEffect, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Dumbbell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserRow, getDayOneWorkout, getUserStats } from "@/lib/gym.functions";
import { syncLocalProfile } from "@/lib/account-sync";


const FREQUENCY_TARGETS: Record<string, number> = {
  "2-days": 2,
  "3-days": 3,
  "4-plus": 4,
};

interface Profile {
  name?: string;
  frequency?: string;
  userId?: string;
}

function readProfile(): Profile {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("gymbuddy-profile") ?? "{}") as Profile;
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home — GymBuddy" },
      { name: "description", content: "Your GymBuddy home. Get ready for your next guided workout." },
      { property: "og:title", content: "Home — GymBuddy" },
      { property: "og:description", content: "Your GymBuddy home. Get ready for your next guided workout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [profile, setProfile] = useState<Profile>({});
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkout = useServerFn(getDayOneWorkout);
  const fetchStats = useServerFn(getUserStats);
  const ensure = useServerFn(ensureUserRow);


  // Keep Home as the signed-in entry point; explicit actions such as Start Workout and Sign Out remain available.
  useBlocker({
    shouldBlockFn: ({ action, current }) => action === "BACK" && current.pathname === "/home",
    enableBeforeUnload: false,
  });

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries(); // stop in-flight queries before 401s land
      queryClient.clear(); // drop cached protected data
      await supabase.auth.signOut(); // session cleared, account data stays in the database
      navigate({ to: "/", replace: true }); // history REPLACE — Back must not restore /home
    } catch {
      setSigningOut(false);
      toast.error("Couldn't sign you out. Try again.");
    }
  };

  // Source of truth is the signed-in account, not browser storage: refresh the
  // local copy from the backend and send unfinished accounts to onboarding.
  useEffect(() => {
    setProfile(readProfile());
    let cancelled = false;
    ensure()
      .then((result) => {
        if (cancelled) return;
        const dest = syncLocalProfile(result);
        if (dest === "/onboarding") {
          navigate({ to: "/onboarding", replace: true });
          return;
        }
        setProfile(readProfile());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: stats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: () => fetchStats({ data: {} }),
  });

  const { data: workout, isLoading: workoutLoading } = useQuery({
    queryKey: ["day-one-workout"],
    queryFn: () => fetchWorkout({ data: {} }),
  });


  const firstName = profile.name?.trim().split(/\s+/)[0] ?? "";
  const completed = stats?.completedWorkouts ?? 0;
  const weeklyTarget = stats?.weeklyTarget ?? FREQUENCY_TARGETS[profile.frequency ?? ""] ?? 3;
  
  const percentage = Math.min(1, completed / weeklyTarget);
  const dashArray = 2 * Math.PI * 44;
  const dashOffset = dashArray * (1 - percentage);

  const firstExercise = workout?.exercises[0];

  return (
    <>
    <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-32 pt-12 text-foreground">
      <header className="flex items-center justify-between">
        <span className="text-xl font-bold text-foreground">GymBuddy<span className="text-primary">.</span></span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Sign out"
          disabled={signingOut}
          onClick={handleSignOut}
          className="size-11 rounded-lg border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut aria-hidden="true" />
        </Button>
      </header>

      <div className="mt-16">
        <p className="text-xs font-semibold uppercase text-primary">Your training starts here</p>
        <h1 className="mt-5 text-[2.5rem] font-semibold leading-tight">
          {firstName ? `Welcome back, ${firstName}! 👋` : "Welcome back! 👋"}
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">Take it one set at a time. Your guided workout is ready when you are.</p>
      </div>

      <section className="mt-14 rounded-lg border border-border bg-card p-8">
        <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">Weekly Consistency</h2>
        <div className="mt-6 flex justify-center">
          <div className="relative size-40">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90">
              <circle cx="50" cy="50" r="44" fill="none" strokeWidth="7" className="stroke-muted" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                className="stroke-primary transition-[stroke-dashoffset] duration-1000 ease-out"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold text-foreground">
                {completed} <span className="text-muted-foreground">/ {weeklyTarget}</span>
              </span>
              <span className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">Workouts</span>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">Weekly Consistency: {completed} / {weeklyTarget} Workouts</p>
      </section>

      <section className="mt-14">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Your workout</h2>
          <span className="text-xs text-muted-foreground">
            {workout ? `01 / ${String(workout.exercises.length).padStart(2, "0")}` : "Day 1"}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">
                {workout?.is_custom ? "Custom Day" : "Today's Focus: Day 1"} · Exercise 01
              </p>
              <h3 className="mt-4 text-2xl font-semibold">
                {firstExercise?.name ?? (workoutLoading ? "Loading…" : "No workout found")}
              </h3>
              {workout && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {workout.target_sets} sets <span className="mx-2 text-primary">·</span> {workout.target_reps} reps
                </p>
              )}
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Dumbbell size={22} strokeWidth={1.7} aria-hidden="true" />
            </div>
          </div>
          <Link to="/custom-routine" className="mt-5 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
            Want to customize? <span className="text-primary">Create your own routine</span>
          </Link>
        </div>
      </section>

      <div className="mt-auto pt-12">
        <Button asChild size="lg" className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]">
          <Link to="/workout">Start Workout <ArrowRight className="ml-2" aria-hidden="true" /></Link>
        </Button>
      </div>
    </main>
    <BottomNav />
    </>
  );
}
