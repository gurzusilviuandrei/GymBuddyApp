import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDayOneWorkout, getAlternativeExercise, getLastLog, logWorkoutSet } from "@/lib/gym.functions";

export const Route = createFileRoute("/_authenticated/workout")({
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

const EXERCISES_PER_SESSION = 3;
type Ex = { id: string; name: string; instructions: string; video_url: string | null; alternative_exercise_id: string | null };

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

  // Identity comes from the signed-in session on the server, so this loads even

  // when the local copy of the profile is missing.
  const { data: workout, isLoading } = useQuery({
    queryKey: ["day-one-workout"],
    queryFn: () => fetchWorkout({ data: {} }),
  });


  const session = workout?.exercises.slice(0, EXERCISES_PER_SESSION) ?? [];
  const targetSets = workout?.target_sets ?? 3;
  const primary = session[index];
  const exercise = swapped ?? primary;
  const setsDone = setNumber > targetSets;
  const isLastExercise = index >= session.length - 1;

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


  const handleNext = () => {
    if (isLastExercise) {
      setComplete(true);
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
      setSwapped(alt);
      setSetNumber(1);
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
    setLogging(true);
    try {
      await logSet({
        data: { exercise_id: exercise.id, weight_kg: w, reps_completed: r, set_number: setNumber },
      });

      toast.success(`Set ${setNumber} logged: ${w} kg × ${r}`);
      setLastLog({ weight_kg: w, reps_completed: r });
      setSetNumber((n) => n + 1);
      setReps("");
    } catch {
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
          {session.length} exercises · {session.length * targetSets} sets crushed.
        </p>
        <Link
          to="/home"
          className="mt-12 flex h-16 w-full max-w-sm items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-neon transition hover:brightness-110"
        >
          Back to Home
        </Link>
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
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {exercise?.instructions ?? (isLoading ? "Loading exercise details…" : "No exercise is assigned to this workout.")}
        </p>
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
        <button
          type="button"
          onClick={handleLogSet}
          disabled={logging || !exercise}
          className="h-16 w-full rounded-2xl bg-primary text-lg font-semibold tracking-wide text-primary-foreground shadow-neon transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {logging
            ? "Logging…"
            : setsDone
              ? isLastExercise
                ? "Finish Workout"
                : "Next Exercise"
              : `Log Set ${setNumber}`}
        </button>
      </div>

      {/* Secondary swap action */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={handleSwap}
          disabled={swapping || !exercise}
          className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-60"
        >
          {swapping ? "Swapping…" : "Machine Occupied? Swap Exercise"}
        </button>
      </div>

       <div className="mt-auto pt-10">
        <Link
           to="/home"
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
           Back to home
        </Link>
      </div>
    </div>
  );
}
