import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildCues, progression, type Exercise, type LastLog } from "@/lib/workout-logic";

type Targets = { targetSets: number; targetReps: number; baseSets: number; baseReps: number };

/** Exercise title, today's target (with the recovery badge) and the three form cues. */
export function ExerciseHeading({
  exercise,
  index,
  total,
  loaded,
  superSore,
  targets: { targetSets, targetReps, baseSets, baseReps },
}: {
  exercise: Exercise | undefined;
  index: number;
  total: number;
  loaded: boolean;
  superSore: boolean;
  targets: Targets;
}) {
  return (
    <>
      {total > 0 && (
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-primary">
          Exercise {index + 1} of {total}
        </p>
      )}
      <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
        {exercise?.name ?? "Your Workout"}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {loaded ? (
          <>
            Target:{" "}
            <span className={superSore && targetSets !== baseSets ? "font-semibold text-primary" : undefined}>{targetSets} Sets</span>
            {" × "}
            <span className={superSore && targetReps !== baseReps ? "font-semibold text-primary" : undefined}>{targetReps} Reps</span>
          </>
        ) : "Loading target…"}
      </p>
      {superSore && (
        <p className="mt-3 inline-flex rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Scaled for Recovery 🛡️ · {targetSets !== baseSets ? `${baseSets}→${targetSets} sets` : `${baseReps}→${targetReps} reps`} · 120s rest
        </p>
      )}
      {exercise ? (
        <section aria-label="Exercise setup and form" className="mt-6 rounded-lg border border-border bg-card p-5">
          <ul className="space-y-5">
            {buildCues(exercise).map(([label, cue]) => (
              <li key={label} className="flex gap-3 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span><strong className="block font-semibold text-foreground">{label}</strong><span className="text-muted-foreground">{cue}</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** "Last time" card with the step-up suggestion and a one-tap fill. */
export function ProgressionCard({
  lastLog,
  targetSets,
  targetReps,
  assisted = false,
  onUse,
}: {
  lastLog: LastLog;
  targetSets: number;
  targetReps: number;
  /** The weight is the machine's help: stepping up means less of it. */
  assisted?: boolean;
  onUse: (weight: number, reps: number) => void;
}) {
  const { base, setsLast, repsLast, hitAll, atLimit, stepUp, suggested } = progression(lastLog, targetSets, targetReps, assisted);
  const unit = assisted ? "kg assistance" : "kg";
  return (
    <div className="mt-6 rounded-2xl border border-primary/40 bg-card p-5" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {hitAll ? "Step-Up Progression ⚡" : "Today's Target"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {hitAll
          ? `Last time you crushed ${setsLast}×${repsLast} @ ${base} ${unit}.`
          : `Last time: ${base} ${unit} × ${lastLog.reps_completed} ${lastLog.reps_completed === 1 ? "rep" : "reps"}.`}
      </p>
      <p className="mt-1 text-base font-medium text-foreground">
        {hitAll ? (
          assisted ? (
            <>Ready for less help: <span className="text-primary">{stepUp} kg assistance</span> today, Bro?</>
          ) : (
            <>Ready to step up to <span className="text-primary">{stepUp} kg</span> today, Bro?</>
          )
        ) : atLimit ? (
          <>No assistance left, Bro! Aim for {targetReps} clean reps, or more.</>
        ) : assisted ? (
          <>Lock in form at <span className="text-primary">{base} kg assistance</span> and aim for {targetReps} clean reps.</>
        ) : (
          <>Lock in form at <span className="text-primary">{base} kg</span> and aim for {targetReps} clean reps.</>
        )}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onUse(suggested, targetReps);
          toast.success(hitAll ? `Loaded ${stepUp} ${unit}. Let's go, Bro!` : `Loaded ${base} ${unit}. Smooth reps today.`);
        }}
        className="mt-4 h-12 w-full rounded-lg border-primary/60 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-primary"
      >
        {hitAll ? (assisted ? "Accept Step-Up (−2.5 kg assistance)" : "Accept Step-Up (+2.5 kg)") : `Use ${base} ${unit} again`}
      </Button>
    </div>
  );
}
