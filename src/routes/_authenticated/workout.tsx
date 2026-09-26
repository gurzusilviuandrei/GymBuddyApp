import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readActiveSession, writeActiveSession, clearActiveSession } from "@/lib/active-session";
import { getDayOneWorkout, getAlternativeExercise, getLastLog, logWorkoutSet, completeWorkout } from "@/lib/gym.functions";

export const Route = createFileRoute("/_authenticated/workout")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "premade" || search["mode"] === "custom" ? search["mode"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Active Workout — GymBuddy" },
      {
        name: "description",
        content:
          "Follow along with your guided exercise video, log your sets, and swap exercises when machines are busy.",
      },
      { property: "og:title", content: "Active Workout — GymBuddy" },
      {
        property: "og:description",
        content:
          "Follow along with your guided exercise video, log your sets, and swap exercises when machines are busy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workout,
});

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-10 text-primary"
      aria-hidden="true"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

const REST_DURATION_MS = 90_000;
type Ex = { id: string; name: string; instructions: string; setup_cue: string | null; position_cue: string | null; movement_cue: string | null; video_url: string | null; alternative_exercise_id: string | null };

function Workout() {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [logging, setLogging] = useState(false);
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [lastLog, setLastLog] = useState<{ weight_kg: number; reps_completed: number } | null>(null);
  const logSet = useServerFn(logWorkoutSet);
  const fetchWorkout = useServerFn(getDayOneWorkout);
  const fetchAlternative = useServerFn(getAlternativeExercise);
  const fetchLastLog = useServerFn(getLastLog);
  const [swapped, setSwapped] = useState<Ex | null>(null);
  const [swapping, setSwapping] = useState(false);
  const finish = useServerFn(completeWorkout);
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<{ sets: number; volume: number } | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const loggedSetIds = useRef<string[]>([]);
  const usedExerciseIds = useRef<Record<number, string>>({});
  const swappedMap = useRef<Record<number, Ex>>({});
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (restEndsAt === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setRestEndsAt(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [restEndsAt]);

  // Identity comes from the signed-in session on the server, so this loads even
  // when the local copy of the profile is missing. `mode` picks the program:
  // premade plan, saved custom routine, or the active default.
  const { mode } = Route.useSearch();
  const { data: workout, isLoading } = useQuery({
    queryKey: ["day-one-workout", mode ?? "auto"],
    queryFn: () => fetchWorkout({ data: { mode } }),
  });


  const session = workout?.exercises ?? [];
  const targetSets = workout?.target_sets ?? 3;
  const primary = session[index];
  const exercise = swapped ?? primary;
  const setsDone = setNumber > targetSets;
  const isLastExercise = index >= session.length - 1;

  // Restore an in-progress session once the program is known.
  useEffect(() => {
    if (!workout || restored) return;
    const cached = readActiveSession();
    if (cached && cached.is_custom_workout === Boolean(workout.is_custom) && cached.current_exercise_index < workout.exercises.length) {
      setIndex(cached.current_exercise_index);
      setSetNumber(cached.current_set_number);
      setStartedAt(cached.session_start_time);
      swappedMap.current = cached.swapped_exercises_map as Record<number, Ex>;
      setSwapped((cached.swapped_exercises_map[cached.current_exercise_index] as Ex | undefined) ?? null);
      loggedSetIds.current = cached.logged_set_ids;
      usedExerciseIds.current = cached.used_exercise_ids;
      toast.success(`Resumed: Exercise ${cached.current_exercise_index + 1} of ${workout.exercises.length}`);
    }
    setRestored(true);
  }, [workout, restored]);

  // Mirror progress to local storage after every change (once something happened).
  useEffect(() => {
    if (!restored || !workout || complete) return;
    const started = loggedSetIds.current.length > 0 || index > 0 || Object.keys(swappedMap.current).length > 0;
    if (!started) return;
    writeActiveSession({
      current_exercise_index: index,
      current_set_number: setNumber,
      is_custom_workout: Boolean(workout.is_custom),
      swapped_exercises_map: swappedMap.current,
      session_start_time: startedAt,
      total_exercises: session.length,
      logged_set_ids: loggedSetIds.current,
      used_exercise_ids: usedExerciseIds.current,
    });
  }, [restored, workout, complete, index, setNumber, swapped, startedAt, session.length]);

  useEffect(() => {
    if (exercise?.name) document.title = `${exercise.name} — GymBuddy`;
  }, [exercise?.name]);

  useEffect(() => {
    setLastLog(null);
    if (!exercise) return;
    let cancelled = false;
    fetchLastLog({ data: { exercise_id: exercise.id } })
      .then((row) => !cancelled && setLastLog(row))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exercise?.id]);



  const handleNext = async () => {
    if (isLastExercise) {
      if (finishing) return;
      setFinishing(true);
      setComplete(true);
      clearActiveSession();
      try {
        const doneIds = session.map((e, i) => usedExerciseIds.current[i] ?? e.id);
        const saved = await finish({
          data: {
            program_type: workout?.is_custom ? "custom" : "premade",
            exercise_ids: doneIds,
            log_ids: loggedSetIds.current,
            started_at: startedAt,
          },
        });
        setSummary({ sets: saved.sets, volume: saved.volume });
        queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        queryClient.invalidateQueries({ queryKey: ["workout-history"] });
        setComplete(true);
      } catch {
        setComplete(false);
        toast.error("Couldn't save your workout. Try again.");
      } finally {
        setFinishing(false);
      }
      return;
    }
    setIndex((i) => i + 1);
    setSwapped(null);
    setSetNumber(1);
    setWeight("");
    setReps("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSwap = async () => {
    if (!exercise || swapping) return;
    setSwapping(true);
    try {
      const alt = await fetchAlternative({ data: { exercise_id: exercise.id } });
      if (!alt) {
        toast.info("No alternative exercise available for this one.");
        return;
      }
      swappedMap.current = { ...swappedMap.current, [index]: alt };
      setSwapped(alt);
      setSetNumber(1);
      usedExerciseIds.current[index] = alt.id;
      toast.success(`Swapped to ${alt.name}`);
    } catch {
      toast.error("Couldn't swap right now. Try again.");
    } finally {
      setSwapping(false);
    }
  };

  const handleLogSet = async () => {
    if (setsDone) return handleNext();
    const w = Number(weight);
    const r = Number(reps);
    if (weight === "" || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r < 1) {
      toast.error("Enter a weight and at least 1 rep.");
      return;
    }
    if (!exercise) {
      toast.error("Your workout is still loading. Try again in a moment.");
      return;
    }
    if (logging || restEndsAt !== null) return;
    // Start at the tap, not after the network request completes.
    if (setNumber < targetSets) {
      setSecondsLeft(90);
      setRestEndsAt(Date.now() + REST_DURATION_MS);
    }
    setLogging(true);
    try {
      const logged = await logSet({
        data: { exercise_id: exercise.id, weight_kg: w, reps_completed: r, set_number: setNumber },
      });
      loggedSetIds.current.push(logged.id);
      usedExerciseIds.current[index] = exercise.id;

      toast.success(`Set ${setNumber} logged: ${w} kg × ${r}`);
      setLastLog({ weight_kg: w, reps_completed: r });
      setSetNumber((n) => n + 1);
      setReps("");
    } catch {
      setRestEndsAt(null);
      toast.error("Couldn't log that set. Try again.");
    } finally {
      setLogging(false);
    }
  };

  if (complete) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-7 text-center text-foreground home-enter">
        <div className="text-7xl" aria-hidden="true">🏆</div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Workout Complete!</h1>
        <p className="mt-3 text-lg text-primary">Bro Status Upgraded 🏆</p>
        <p className="mt-4 text-base text-muted-foreground">
          {summary
            ? `${session.length} exercises · ${summary.sets} sets crushed · ${summary.volume} kg lifted. Saved to your History.`
            : "Saving your workout…"}
        </p>
        {summary && (
          <Button asChild className="mt-12 h-16 w-full max-w-sm text-lg font-semibold shadow-neon">
            <Link to="/home">Back to Home</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-7 pb-10 pt-14 text-foreground">
      {/* Exercise video placeholder */}
      <div
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-5 rounded-3xl border-2 border-border bg-card"
        role="img"
        aria-label={`${exercise?.name ?? "Exercise"} Video Guide placeholder`}
      >
        <PlayIcon />
        <p className="text-base font-medium tracking-wide text-muted-foreground">
          {exercise ? `${exercise.name} Video Guide` : "Loading your workout…"}
        </p>
      </div>

      {/* Exercise title & target */}
      <div key={exercise?.id} className="mt-10 home-enter">
        {session.length > 0 && (
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-primary">
            Exercise {index + 1} of {session.length}
          </p>
        )}
        <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
          {exercise?.name ?? "Your Workout"}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {workout ? `Target: ${workout.target_sets} Sets × ${workout.target_reps} Reps` : "Loading target…"}
        </p>
        {exercise ? (
          <section aria-label="Exercise setup and form" className="mt-6 rounded-lg border border-border bg-card p-5">
            <ul className="space-y-5">
              {([
                ["Machine Setup", exercise.setup_cue || "Choose a manageable load and check your equipment."],
                ["Starting Position", exercise.position_cue || "Get stable and brace your core before you move."],
                ["Key Movement Cue", exercise.movement_cue || exercise.instructions || "Move slowly and with control."],
              ] as const).map(([label, cue]) => (
                <li key={label} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span><strong className="block font-semibold text-foreground">{label}</strong><span className="text-muted-foreground">{cue}</span></span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="mt-4 text-muted-foreground">{isLoading ? "Loading exercise details…" : "No exercise is assigned to this workout."}</p>
        )}
        {lastLog && (
          <div className="mt-6 rounded-2xl border border-primary/40 bg-card p-5" aria-live="polite">
            <p className="text-sm text-muted-foreground">
              Last time: {lastLog.weight_kg} kg × {lastLog.reps_completed}
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              Today: Try to hit <span className="text-primary">{lastLog.reps_completed + 1} reps</span> or add{" "}
              <span className="text-primary">2.5kg</span>.
            </p>
          </div>
        )}
      </div>

      {/* Set logging inputs */}
      <div className="mt-10 grid grid-cols-2 gap-5" role="group" aria-label="Log a set">
        <label className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Weight (kg)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={500}
            step={0.5}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0"
            className="h-16 w-full rounded-2xl border-2 border-input bg-card px-6 text-lg font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-hidden focus:ring-3 focus:ring-primary/25"
          />
        </label>
        <label className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Reps
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="0"
            className="h-16 w-full rounded-2xl border-2 border-input bg-card px-6 text-lg font-medium text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-hidden focus:ring-3 focus:ring-primary/25"
          />
        </label>
      </div>

      {/* Log Set */}
      <div className="mt-8">
        <Button
          type="button"
          onClick={handleLogSet}
          disabled={logging || finishing || !exercise || restEndsAt !== null}
          className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon"
        >
          {logging
            ? "Logging…"
            : setsDone
              ? isLastExercise
                ? "Finish Workout"
                : "Next Exercise"
              : `Log Set ${setNumber}`}
        </Button>
      </div>

      {/* Secondary swap action */}
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={handleSwap}
          disabled={swapping || !exercise}
          className="h-auto min-h-11 whitespace-normal rounded-lg px-6 py-3 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {swapping ? "Swapping…" : "Machine Occupied? Swap Exercise"}
        </Button>
      </div>

       <div className="mt-auto pt-10">
        <Link
           to="/home"
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
           Back to home
        </Link>
      </div>
       {restEndsAt !== null && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-7 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Rest timer">
           <div className="w-full max-w-sm text-center">
             <p className="text-sm font-semibold uppercase tracking-widest text-primary">Rest between sets</p>
             <p className="mt-4 text-7xl font-semibold tabular-nums text-foreground" role="timer" aria-label={`${secondsLeft} seconds remaining`}>
               {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
             </p>
             <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={90} aria-valuenow={90 - secondsLeft} aria-label="Rest progress">
               <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((90 - secondsLeft) / 90) * 100}%` }} />
             </div>
             <Button type="button" variant="link" onClick={() => setRestEndsAt(null)} className="mt-7 text-base text-muted-foreground hover:text-primary">
               Skip Rest
             </Button>
           </div>
         </div>
       )}
    </div>
  );
}
