import { useEffect, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronDown, Dumbbell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserRow, getDayOneWorkout, getUserStats, getWorkoutHistory, logWorkoutSet } from "@/lib/gym.functions";
import { SessionCard } from "@/components/SessionCard";
import { syncLocalProfile } from "@/lib/account-sync";
import { readActiveSession, writeActiveSession, clearActiveSession, type ActiveSession } from "@/lib/active-session";
import { QUEUE_EVENT, readOfflineQueue, writeOfflineQueue } from "@/lib/offline-queue";
import { OfflineSyncBadge } from "@/components/OfflineSyncBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RecoveryModeCard } from "@/components/RecoveryModeCard";


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

const BAG_ITEMS = [
  ["water", "Water Bottle", "Stay hydrated, Bro"],
  ["padlock", "Locker Padlock", "Secure your gear"],
  ["shoes", "Flat-Soled Shoes", "For solid lifting stability"],
  ["towel", "Small Towel", "Wipe down your setups"],
] as const;

type BagItemId = (typeof BAG_ITEMS)[number][0];

function readBagChecklist(): BagItemId[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(localStorage.getItem("gymbuddy-bag-checklist") ?? "[]") as string[];
    return BAG_ITEMS.flatMap(([id]) => (saved.includes(id) ? [id] : []));
  } catch {
    return [];
  }
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
  const [bagOpen, setBagOpen] = useState(true);
  const [checkInMode, setCheckInMode] = useState<"premade" | "custom" | null>(null);
  const [trainAnyway, setTrainAnyway] = useState(false);
  const [customAutoRegulate, setCustomAutoRegulate] = useState(false);
  const [autoRegulate, setAutoRegulate] = useState(false);
  const [bagChecked, setBagChecked] = useState<BagItemId[]>(() => readBagChecklist());
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
  const logSet = useServerFn(logWorkoutSet);

  // Background sync for sets left in the offline queue after leaving a workout.
  // Event-driven with backoff: no timer runs while the queue is empty.
  useEffect(() => {
    let running = false;
    let timer = 0;
    let delay = 5000;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || timer) return;
      timer = window.setTimeout(() => { timer = 0; void flush(); }, delay);
    };

    const flush = async () => {
      if (cancelled || running) return;
      const queue = readOfflineQueue();
      if (queue.length === 0) { delay = 5000; return; }
      if (!navigator.onLine) { schedule(); return; }
      running = true;
      try {
        for (const item of queue) {
          if (!navigator.onLine) break;
          const row = await logSet({ data: { exercise_id: item.exercise_id, weight_kg: item.weight_kg, reps_completed: item.reps, set_number: item.set_number, client_key: item.key } });
          writeOfflineQueue(readOfflineQueue().filter((x) => x.key !== item.key));
          const s = readActiveSession();
          if (s) {
            writeActiveSession({
              ...s,
              logged_set_ids: [...s.logged_set_ids, row.id],
              logged_sets: (s.logged_sets ?? []).map((x) => (x.key === item.key ? { ...x, id: row.id, status: "saved" as const } : x)),
            });
          }
        }
        delay = 5000;
      } catch {
        delay = Math.min(delay * 2, 60000); // still spotty — back off
      } finally {
        running = false;
        if (readOfflineQueue().length > 0) schedule();
      }
    };

    const kick = () => { delay = 5000; void flush(); };
    void flush();
    window.addEventListener("online", kick);
    window.addEventListener(QUEUE_EVENT, kick);
    return () => {
      cancelled = true;
      window.removeEventListener("online", kick);
      window.removeEventListener(QUEUE_EVENT, kick);
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




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

  const todayKey = new Date().toDateString();
  const trainedToday = Boolean(recent?.some((s) => s.completedAt && new Date(s.completedAt).toDateString() === todayKey));
  const isRestDay = !trainAnyway && Boolean(stats) && (completed >= weeklyTarget || trainedToday);

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
      <OfflineSyncBadge className="mt-4" />


      {stats?.totalLoggedSets === 0 && (
        <Collapsible open={bagOpen} onOpenChange={setBagOpen} className="mt-10 rounded-lg border-2 border-primary/50 bg-card shadow-neon">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="h-auto w-full justify-between whitespace-normal rounded-lg px-5 py-5 text-left hover:bg-secondary/60">
              <span className="text-base font-semibold text-foreground">🎒 Your Gym Bag Checklist (Before Workout #1)</span>
              <ChevronDown className={`size-5 shrink-0 text-primary transition-transform ${bagOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border px-5 py-2">
              {BAG_ITEMS.map(([id, label, detail]) => (
                <label key={id} className="flex cursor-pointer items-start gap-4 border-b border-border py-4 last:border-b-0">
                  <Checkbox
                    checked={bagChecked.includes(id)}
                    onCheckedChange={(checked) => {
                      const next = checked ? [...bagChecked, id] : bagChecked.filter((item) => item !== id);
                      setBagChecked(next);
                      localStorage.setItem("gymbuddy-bag-checklist", JSON.stringify(next));
                    }}
                    aria-label={label}
                    className="mt-0.5 size-5"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

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
              writeOfflineQueue([]);
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
        {completed > weeklyTarget && (
          <p className="mt-6 text-center">
            <span className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              +{completed - weeklyTarget} bonus {completed - weeklyTarget === 1 ? "workout" : "workouts"}
            </span>
          </p>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {completed >= weeklyTarget
            ? "Weekly goal smashed, Bro! Extra sessions still count."
            : `Weekly Consistency: ${completed} / ${weeklyTarget} Workouts`}
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">Resets every Monday</p>
      </section>

      {isRestDay ? (
      <section className="mt-14" aria-label="Rest and recovery">
        <RecoveryModeCard onTrainAnyway={() => setTrainAnyway(true)} />
      </section>
      ) : (
      <section className="mt-14 space-y-6" aria-label="Your programs">
        {/* Card A — Pre-Made Plan */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">Guided Program</p>
              <h3 className="mt-3 text-xl font-semibold">The GymBuddy Pre-Made Plan</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Next up: Day {workout?.split_day ?? "A"}</span>
                <span className="block">{workout?.split_focus ?? "Squat Focus · Horizontal Press · Horizontal Pull"}</span>
              </p>
              <div className="mt-3 flex gap-1.5" aria-label="3-day split rotation">
                {(["A", "B", "C"] as const).map((d) => (
                  <span key={d} className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${d === (workout?.split_day ?? "A") ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>Day {d}</span>
                ))}
              </div>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Dumbbell size={22} strokeWidth={1.7} aria-hidden="true" />
            </div>
          </div>
          <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
            <span className="text-sm font-semibold text-foreground">🤕 Low energy / Super sore today?</span>
            <Switch checked={autoRegulate} onCheckedChange={setAutoRegulate} aria-label="Low energy or super sore today" />
          </label>
          {autoRegulate && (
            <p className="mt-2 text-xs text-primary animate-fade-in">No worries, Bro. We auto-regulated today's session. Showing up is a win.</p>
          )}
          <Button
            type="button"
            onClick={() => (autoRegulate ? navigate({ to: "/workout", search: { mode: "premade", sore: "super" } }) : setCheckInMode("premade"))}
            className="mt-4 h-14 w-full rounded-lg text-base font-semibold shadow-neon transition-transform active:scale-[0.98]"
          >
            Start Day {workout?.split_day ?? "A"} Workout <ArrowRight className="ml-2" aria-hidden="true" />
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
              <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
                <span className="text-sm font-semibold text-foreground">🤕 Low energy / Super sore today?</span>
                <Switch checked={customAutoRegulate} onCheckedChange={setCustomAutoRegulate} aria-label="Low energy or super sore today" />
              </label>
              {customAutoRegulate && (
                <p className="mt-2 text-xs text-primary animate-fade-in">No worries, Bro. We auto-regulated today's session. Showing up is a win.</p>
              )}
              <Button
                type="button"
                onClick={() => (customAutoRegulate ? navigate({ to: "/workout", search: { mode: "custom", sore: "super" } }) : setCheckInMode("custom"))}
                className="mt-4 h-14 w-full rounded-lg text-base font-semibold shadow-neon transition-transform active:scale-[0.98]"
              >
                Start Custom Workout <ArrowRight className="ml-2" aria-hidden="true" />
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
      )}

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
    {checkInMode && (
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-background/90 px-5 pb-8 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="checkin-title" onClick={() => setCheckInMode(null)}>
        <div className="w-full max-w-md rounded-lg border border-primary/40 bg-card p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <p id="checkin-title" className="text-xl font-semibold text-foreground">Muscle Status Check-in</p>
          <p className="mt-2 text-sm text-muted-foreground">How do your muscles feel today? One tap and we'll tune your session.</p>
          <div className="mt-5 grid gap-3">
            {([
              ["fresh", "💪", "Fresh", "Full session as planned"],
              ["little", "🙂", "A Little Sore", "Normal session — warm up well"],
              ["super", "🥵", "Super Sore", "Auto-adjusted: 2 sets, 120s rest"],
            ] as const).map(([key, emoji, label, detail]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const mode = checkInMode;
                  setCheckInMode(null);
                  navigate({ to: "/workout", search: { mode, sore: key } });
                }}
                className="flex items-center gap-4 rounded-lg border-2 border-primary/40 bg-background px-4 py-4 text-left transition hover:border-primary hover:shadow-neon"
              >
                <span className="text-2xl" aria-hidden="true">{emoji}</span>
                <span>
                  <span className="block font-semibold text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
              </button>
            ))}
          </div>
          <Button type="button" variant="ghost" onClick={() => setCheckInMode(null)} className="mt-3 w-full text-muted-foreground">Cancel</Button>
        </div>
      </div>
    )}
    </>
  );
}
