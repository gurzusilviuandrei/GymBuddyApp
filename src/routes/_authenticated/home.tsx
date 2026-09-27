import { useEffect, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Dumbbell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserRow, getDayOneWorkout, getUserStats, getWorkoutHistory } from "@/lib/gym.functions";
import { SessionCard } from "@/components/SessionCard";
import { syncLocalProfile } from "@/lib/account-sync";
import { readActiveSession, clearActiveSession, type ActiveSession } from "@/lib/active-session";


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
  // Read the cached copies once during mount instead of re-rendering right after.
  const [profile, setProfile] = useState<Profile>(() => readProfile());
  const [signingOut, setSigningOut] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(() => readActiveSession());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchWorkout = useServerFn(getDayOneWorkout);
  const fetchStats = useServerFn(getUserStats);
  const fetchHistory = useServerFn(getWorkoutHistory);
  const { data: recent } = useQuery({
    queryKey: ["workout-history", "recent"],
    queryFn: () => fetchHistory({ data: { limit: 3 } }),
  });
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
  // Cached through the query client so returning to Home does not re-request it.
  useEffect(() => {
    setProfile(readProfile());
    let cancelled = false;
    queryClient
      .fetchQuery({
        queryKey: ["ensure-user-row"],
        queryFn: () => ensure(),
        staleTime: 5 * 60 * 1000,
      })
      .then(async (result) => {
        if (cancelled) return;
        if (result.accountMissing) {
          await supabase.auth.signOut();
          navigate({ to: "/", replace: true });
          return;
        }
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
    queryFn: () => fetchStats({ data: { tz_offset: new Date().getTimezoneOffset() } }),
  });

  const { data: workout } = useQuery({
    queryKey: ["day-one-workout"],
    queryFn: () => fetchWorkout({ data: {} }),
  });

  const firstName = profile.name?.trim().split(/\s+/)[0] ?? "";
  const completed = stats?.completedWorkouts ?? 0;
  const weeklyTarget = stats?.weeklyTarget ?? FREQUENCY_TARGETS[profile.frequency ?? ""] ?? 3;

  const percentage = Math.min(1, completed / weeklyTarget);
  const dashArray = 2 * Math.PI * 44;
  const dashOffset = dashArray * (1 - percentage);

  const hasCustom = Boolean(workout?.is_custom && (workout?.exercises.length ?? 0) > 0);
  const customNames = hasCustom ? workout?.exercises.map((e) => e.name) ?? [] : [];

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

      {active && (
        <section className="mt-10 rounded-lg border-2 border-primary bg-primary/10 p-6 shadow-neon" aria-label="Workout in progress">
          <h2 className="text-lg font-semibold text-foreground">Workout in Progress ⚡</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Resume Your Session: Exercise {active.current_exercise_index + 1} of {active.total_exercises}
          </p>
          <Button asChild className="mt-5 h-14 w-full rounded-lg text-base font-semibold shadow-neon">
            <Link to="/workout" search={{ mode: active.is_custom_workout ? "custom" : "premade" }}>
              Resume Workout <ArrowRight className="ml-2" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              clearActiveSession();
              setActive(null);
              toast.success("Workout abandoned.");
            }}
            className="mt-2 w-full text-sm text-muted-foreground hover:text-destructive"
          >
            Abandon Workout
          </Button>
        </section>
      )}

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

      <section className="mt-14 space-y-6" aria-label="Your programs">
        {/* Card A — Pre-Made Plan */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">Guided Program</p>
              <h3 className="mt-3 text-xl font-semibold">The GymBuddy Pre-Made Plan</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                 Day 1 · Full Body Compound ({workout?.is_custom ? "Guided workout" : `${workout?.exercises.length ?? 0} movements`})
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Dumbbell size={22} strokeWidth={1.7} aria-hidden="true" />
            </div>
          </div>
          <Button asChild className="mt-6 h-14 w-full rounded-lg text-base font-semibold shadow-neon transition-transform active:scale-[0.98]">
            <Link to="/workout" search={{ mode: "premade" }}>
              Start Pre-Made Workout <ArrowRight className="ml-2" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {/* Card B — Custom Routine Builder */}
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase text-primary">Your Program</p>
          <h3 className="mt-3 text-xl font-semibold">Your Custom Routine Builder</h3>
          {hasCustom ? (
            <>
              <ul className="mt-4 space-y-2.5">
                {customNames.map((name) => (
                  <li key={name} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {name}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-6 h-14 w-full rounded-lg text-base font-semibold shadow-neon transition-transform active:scale-[0.98]">
                <Link to="/workout" search={{ mode: "custom" }}>
                  Start Custom Workout <ArrowRight className="ml-2" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-lg border-primary/60 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-primary">
                <Link to="/custom-routine">Edit Routine</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                No custom routine assembled yet, Bro.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-6 h-14 w-full rounded-lg border-primary/60 text-base font-semibold text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Link to="/custom-routine">Assemble Custom Routine</Link>
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="mt-14" aria-label="Recent workouts">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent Workouts</h2>
          <Link to="/history" className="text-sm font-semibold text-primary hover:underline">See all</Link>
        </div>
        <div className="mt-4 space-y-4">
          {recent && recent.length > 0 ? (
            recent.map((s) => <SessionCard key={s.id} session={s} />)
          ) : (
            <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              No finished workouts yet. Complete one and it lands here.
            </p>
          )}
        </div>
      </section>
    </main>
    <BottomNav />
    </>
  );
}
