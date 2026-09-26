import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getActiveExercise, getAlternativeExercise, logWorkoutSet } from "@/lib/gym.functions";

export const Route = createFileRoute("/workout")({
  head: () => ({
    meta: [
      { title: "Active Workout — Lat Pulldown" },
      {
        name: "description",
        content:
          "Follow along with your guided exercise video, log your sets, and swap exercises when machines are busy.",
      },
      { property: "og:title", content: "Active Workout — Lat Pulldown" },
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

function Workout() {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [logging, setLogging] = useState(false);
  const logSet = useServerFn(logWorkoutSet);
  const fetchExercise = useServerFn(getActiveExercise);
  const fetchAlternative = useServerFn(getAlternativeExercise);
  const [swapped, setSwapped] = useState<{ id: string; name: string; instructions: string; alternative_exercise_id: string | null } | null>(null);
  const [swapping, setSwapping] = useState(false);

  let userId: string | undefined;
  try {
    userId = JSON.parse(localStorage.getItem("gymbuddy-profile") ?? "{}").userId;
  } catch {
    userId = undefined;
  }

  const { data: primary } = useQuery({
    queryKey: ["active-exercise", userId],
    queryFn: () => fetchExercise({ data: { user_id: userId! } }),
    enabled: Boolean(userId),
  });

  const exercise = swapped ?? primary;

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
    const w = Number(weight);
    const r = Number(reps);
    if (weight === "" || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r < 1) {
      toast.error("Enter a weight and at least 1 rep.");
      return;
    }
    if (!userId) {
      toast.error("Finish setting up your profile first.");
      return;
    }
    if (!exercise) {
      toast.error("Your workout is still loading. Try again in a moment.");
      return;
    }
    setLogging(true);
    try {
      await logSet({
        data: { user_id: userId, exercise_id: exercise.id, weight_kg: w, reps_completed: r, set_number: setNumber },
      });
      toast.success(`Set ${setNumber} logged: ${w} kg × ${r}`);
      setSetNumber((n) => n + 1);
      setReps("");
    } catch {
      toast.error("Couldn't log that set. Try again.");
    } finally {
      setLogging(false);
    }
  };

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
      <div className="mt-10">
        <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
          {exercise?.name ?? "Your Workout"}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {exercise?.instructions || "Target: 3 Sets x 10 Reps"}
        </p>
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
          disabled={logging}
          className="h-16 w-full rounded-2xl bg-primary text-lg font-semibold tracking-wide text-primary-foreground shadow-neon transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {logging ? "Logging…" : `Log Set ${setNumber}`}
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
