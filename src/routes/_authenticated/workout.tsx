import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { ArrowRightLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { abandonActiveSession, readActiveSession, writeActiveSession, clearActiveSession, type CachedSet } from "@/lib/active-session";
import { usePro } from "@/components/pro/ProProvider";
import { getDayOneWorkout, getAlternativeOptions, getLastLog, getUserStats, completeWorkout, updateWorkoutSet, deleteWorkoutSet } from "@/lib/gym-api";
import { MachineAlignment } from "@/components/workout/MachineAlignment";
import { writeOfflineQueue, addPendingDelete, readPendingDeletes, removePendingDelete } from "@/lib/offline-queue";
import { OfflineSyncBadge } from "@/components/OfflineSyncBadge";
import { PlateVisualizer, Stepper, WarmUpCalculator } from "@/components/workout/GymTools";
import { useIdleNudge } from "@/hooks/use-idle-nudge";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { ExerciseDemo } from "@/components/workout/ExerciseDemo";
import { ExerciseHeading, ProgressionCard } from "@/components/workout/ExerciseOverview";
import { LoggedSets } from "@/components/workout/LoggedSets";
import { RestOverlay } from "@/components/workout/RestOverlay";
import { SwapDrawer } from "@/components/workout/SwapDrawer";
import { IdleNudge, LeaveWorkoutDialog, PersonalRecordDialog } from "@/components/workout/WorkoutDialogs";
import { WorkoutComplete, type WorkoutSummary } from "@/components/workout/WorkoutComplete";
import { haptic, keepScreenOn } from "@/lib/native-workout";
import { allSaved, flushPending, nextRetryDelay, RETRY_MIN_MS, syncSet as uploadSet } from "@/lib/set-sync";
import { syncApi, syncEnv } from "@/lib/set-sync-client";
import {
  buildCues,
  canResume,
  durationMinutes,
  lastSetFor,
  newSetKey,
  parseCorrection,
  parseNewSet,
  removeSet as withoutSet,
  sessionTargets,
  type Exercise,
  type LastLog,
} from "@/lib/workout-logic";

export const Route = createFileRoute("/_authenticated/workout")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "premade" || search["mode"] === "custom" ? search["mode"] : undefined,
    sore: search["sore"] === "fresh" || search["sore"] === "little" || search["sore"] === "super" ? search["sore"] : undefined,
  }) as { mode?: "premade" | "custom"; sore?: "fresh" | "little" | "super" },
  component: Workout,
});

// How sets reach the account: see src/lib/set-sync.ts and set-sync-client.ts.

function Workout() {
  const { mode, sore } = Route.useSearch();
  const superSore = sore === "super";
  const queryClient = useQueryClient();
  const { isPro, requirePro } = usePro();
  const rest = useRestTimer(superSore ? 120 : 90);

  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [logging, setLogging] = useState(false);
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [pr, setPr] = useState<{ weight: number; name: string } | null>(null);
  const [lastLog, setLastLog] = useState<LastLog | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapped, setSwapped] = useState<Exercise | null>(null);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [restored, setRestored] = useState(false);
  const [sets, setSets] = useState<CachedSet[]>([]);

  const prShown = useRef(new Set<string>());
  const loggedSetIds = useRef<string[]>([]);
  const usedExerciseIds = useRef<Record<number, string>>({});
  const swappedMap = useRef<Record<number, Exercise>>({});
  const setsRef = useRef<CachedSet[]>([]);
  const finishLock = useRef(false);
  const logLock = useRef(false);
  // Set once the member abandons, so nothing re-saves the workout on the way out.
  const abandoned = useRef(false);

  useEffect(() => {
    if (!pr) return;
    const t = setTimeout(() => setPr(null), 3500);
    return () => clearTimeout(t);
  }, [pr]);

  // Single source of truth for logged sets; ids feed the completion totals.
  const commitSets = (updater: (prev: CachedSet[]) => CachedSet[]) => {
    const next = updater(setsRef.current);
    setsRef.current = next;
    loggedSetIds.current = next.flatMap((x) => (x.id ? [x.id] : []));
    setSets(next);
  };

  // Keep the screen awake while training; released on finish or leaving the page.
  useEffect(() => {
    if (complete) return;
    return keepScreenOn();
  }, [complete]);

  // Identity comes from the signed-in session on the server, so this loads even
  // when the local copy of the profile is missing. `mode` picks the program:
  // premade plan, saved custom routine, or the active default.
  const { data: workout, isLoading } = useQuery({
    queryKey: ["day-one-workout", mode ?? "auto"],
    queryFn: () => getDayOneWorkout({ data: { mode } }),
  });

  const session = workout?.exercises ?? [];
  const baseSets = workout?.target_sets ?? 3;
  const baseReps = workout?.target_reps ?? 10;
  const { targetSets, targetReps } = sessionTargets(baseSets, baseReps, superSore);
  const exercise = swapped ?? session[index];
  const setsDone = setNumber > targetSets;
  const isLastExercise = index >= session.length - 1;
  const nameOf = (exerciseId: string) =>
    session.find((e) => e.id === exerciseId)?.name ?? (exercise?.id === exerciseId ? exercise.name : "lift");

  // Restore an in-progress session once the program is known.
  useEffect(() => {
    if (!workout || restored) return;
    const cached = readActiveSession();
    if (canResume(cached, Boolean(workout.is_custom), workout.exercises.length)) {
      setIndex(cached.current_exercise_index);
      setSetNumber(cached.current_set_number);
      setStartedAt(cached.session_start_time);
      swappedMap.current = cached.swapped_exercises_map as Record<number, Exercise>;
      setSwapped((cached.swapped_exercises_map[cached.current_exercise_index] as Exercise | undefined) ?? null);
      loggedSetIds.current = cached.logged_set_ids;
      if (cached.logged_sets?.length) commitSets(() => cached.logged_sets!);
      usedExerciseIds.current = cached.used_exercise_ids;
      // Auto-fill from the last set logged for this exercise, like live progression does.
      const previous = lastSetFor(cached.logged_sets ?? [], cached.current_exercise_index);
      if (previous) {
        setWeight(String(previous.weight_kg));
        setReps(String(previous.reps));
      }
      toast.success(`Resumed: Exercise ${cached.current_exercise_index + 1} of ${workout.exercises.length}`);
    }
    setRestored(true);
  }, [workout, restored]);

  // Mirror progress to device storage after every change (once something happened).
  useEffect(() => {
    if (!restored || !workout || complete || abandoned.current) return;
    const started = setsRef.current.length > 0 || loggedSetIds.current.length > 0 || index > 0 || Object.keys(swappedMap.current).length > 0;
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
      logged_sets: setsRef.current,
    });
  }, [restored, workout, complete, index, setNumber, swapped, startedAt, session.length, sets]);

  // Exit guard: only while a session is actually in progress.
  const sessionActive = !complete && !finishing && (sets.length > 0 || index > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => sessionActive,
    enableBeforeUnload: () => sessionActive,
    withResolver: true,
  });

  const store = { get: () => setsRef.current, commit: commitSets };
  const syncSet = (key: string) =>
    uploadSet(key, store, syncApi, syncEnv, (item) => {
      if (prShown.current.has(item.key)) return;
      prShown.current.add(item.key);
      haptic("success");
      setPr({ weight: item.weight_kg, name: nameOf(item.exercise_id) });
    });

  const kickSyncRef = useRef<() => void>(() => {});
  // Always call the latest syncSet so background retries see the loaded workout.
  const syncSetRef = useRef(syncSet);
  syncSetRef.current = syncSet;

  // Mirror every unsynced set into the offline queue so the badge (and Home) can see it,
  // and wake the retry loop whenever a set is still waiting to reach the account.
  useEffect(() => {
    const unsynced = sets.filter((x) => x.status !== "saved");
    writeOfflineQueue(unsynced);
    if (unsynced.some((x) => x.status === "local")) kickSyncRef.current();
  }, [sets]);

  // Background sync: retry unsaved sets on reconnect, with backoff. No timer runs
  // while every set is saved, so an idle tracker screen stays completely quiet.
  useEffect(() => {
    let running = false;
    let timer = 0;
    let delay = RETRY_MIN_MS;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || timer) return;
      timer = window.setTimeout(() => { timer = 0; void retry(); }, delay);
    };

    const retry = async () => {
      if (cancelled || running) return;
      if (!setsRef.current.some((s) => s.status === "local") && readPendingDeletes().length === 0) {
        delay = RETRY_MIN_MS;
        return;
      }
      if (!navigator.onLine) { schedule(); return; }
      running = true;
      const result = await flushPending({ get: () => setsRef.current, commit: commitSets }, syncApi, syncEnv, (key) => syncSetRef.current(key));
      running = false;
      delay = nextRetryDelay(delay, result);
      // Anything still waiting, including sets logged during this pass.
      if (setsRef.current.some((s) => s.status === "local") || readPendingDeletes().length > 0) schedule();
    };

    const kick = () => { delay = RETRY_MIN_MS; void retry(); };
    kickSyncRef.current = kick;
    window.addEventListener("online", kick);

    return () => {
      cancelled = true;
      window.removeEventListener("online", kick);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleDeleteSet = (key: string) => {
    const target = setsRef.current.find((x) => x.key === key);
    if (!target) return;
    commitSets((prev) => withoutSet(prev, key));
    if (target.exercise_index === index) setSetNumber((n) => Math.max(1, n - 1));
    if (target.id) {
      const id = target.id;
      // Record the deletion on the device first: if the app closes before signal
      // returns, the removal is still pending and the set can't come back.
      addPendingDelete(id);
      deleteWorkoutSet({ data: { id } })
        .then(() => removePendingDelete(id))
        .catch(() => {});
    }
    toast.success("Set removed");
  };

  const saveEdit = (target: CachedSet, weightText: string, repsText: string): boolean => {
    const fix = parseCorrection(weightText, repsText);
    if (!fix) {
      toast.error("Enter a weight (0–1000 kg) and 1–100 reps.");
      return false;
    }
    const before = { weight_kg: target.weight_kg, reps: target.reps };
    commitSets((prev) => prev.map((x) => (x.key === target.key ? { ...x, weight_kg: fix.weight, reps: fix.reps } : x)));
    if (target.id) {
      updateWorkoutSet({ data: { id: target.id, weight_kg: fix.weight, reps_completed: fix.reps } })
        .then((res) => {
          // A correction can push the set past your all-time best — celebrate it,
          // and never leave an old best marked as a record after it's lowered.
          if (res?.is_personal_record) {
            prShown.current.add(target.key);
            haptic("success");
            setPr({ weight: fix.weight, name: nameOf(target.exercise_id) });
          } else {
            prShown.current.delete(target.key);
          }
        })
        .catch(() => {
          commitSets((prev) => prev.map((x) => (x.key === target.key ? { ...x, ...before } : x)));
          toast.error("Couldn't save that correction. Try again.");
        });
    }
    return true;
  };

  useEffect(() => {
    if (exercise?.name) document.title = `${exercise.name} — GymBuddy`;
  }, [exercise?.name]);

  useEffect(() => {
    setLastLog(null);
    if (!exercise) return;
    let cancelled = false;
    getLastLog({ data: { exercise_id: exercise.id } })
      .then((row) => !cancelled && setLastLog(row))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exercise?.id]);

  const handleNext = async () => {
    if (isLastExercise) {
      // Synchronous lock: two taps in the same frame both see finishing === false,
      // so the ref is what actually stops a second finish going out.
      if (finishing || finishLock.current) return;
      // Nothing logged: there is no workout to save yet.
      if (setsRef.current.length === 0 || loggedSetIds.current.length === 0) {
        toast.error("Log at least one set before finishing, Bro.");
        return;
      }
      finishLock.current = true;
      setFinishing(true);
      // Push any locally saved sets and pending deletions before totalling.
      await Promise.all(setsRef.current.filter((x) => !x.id).map((x) => syncSet(x.key)));
      if (!allSaved(setsRef.current)) {
        finishLock.current = false;
        setFinishing(false);
        toast.error("Some sets are only saved locally. Check your connection and try again.");
        return;
      }
      await Promise.all(
        readPendingDeletes().map((id) =>
          deleteWorkoutSet({ data: { id } })
            .then(() => removePendingDelete(id))
            .catch(() => {}),
        ),
      );
      try {
        const doneIds = session.map((e, i) => usedExerciseIds.current[i] ?? e.id);
        const saved = await completeWorkout({
          data: {
            program_type: workout?.is_custom ? "custom" : "premade",
            exercise_ids: doneIds,
            log_ids: loggedSetIds.current,
            started_at: startedAt,
            split_day: workout?.is_custom ? undefined : workout?.split_day,
            auto_regulated: superSore,
          },
        });
        // Saved for good — only now is it safe to drop the local copy.
        // Deletions that didn't get through stay queued for the background sync.
        clearActiveSession();
        writeOfflineQueue([]);
        // A stats hiccup must never look like a failed save; fall back to a local count.
        let weeklyWorkouts = 1;
        try {
          const freshStats = await getUserStats({ data: { tz_offset: new Date().getTimezoneOffset() } });
          weeklyWorkouts = freshStats.completedWorkouts;
        } catch {
          /* totals refresh on Home */
        }
        setSummary({ sets: saved.sets, volume: saved.volume, durationMinutes: durationMinutes(startedAt), weeklyWorkouts });
        queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        queryClient.invalidateQueries({ queryKey: ["workout-history"] });
        // Next split day loads when Home mounts; don't swap this screen's plan now.
        queryClient.invalidateQueries({ queryKey: ["day-one-workout"], refetchType: "none" });
        setComplete(true);
      } catch {
        // Release the lock so a retry is possible after a failed save.
        finishLock.current = false;
        toast.error("Couldn't save your workout. Your sets are safe — try again.");
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

  const { data: swapOptions, isFetching: loadingOptions } = useQuery({
    queryKey: ["swap-options", exercise?.id],
    queryFn: () => getAlternativeOptions({ data: { exercise_id: exercise!.id, exclude: session.map((e) => e.id) } }),
    enabled: swapOpen && isPro && Boolean(exercise),
  });

  const handleSwap = (alt: Exercise) => {
    swappedMap.current = { ...swappedMap.current, [index]: alt };
    setSwapped(alt);
    setSetNumber(1);
    usedExerciseIds.current[index] = alt.id;
    toast.success(`Swapped to ${alt.name}`);
    setSwapOpen(false);
  };

  const idle = useIdleNudge(!complete && !rest.resting && Boolean(exercise), [sets.length, !rest.resting, index]);

  const handleLogSet = async () => {
    if (setsDone) return handleNext();
    const entry = parseNewSet(weight, reps);
    if (!entry) {
      toast.error("Enter a weight and at least 1 rep.");
      return;
    }
    if (!exercise) {
      toast.error("Your workout is still loading. Try again in a moment.");
      return;
    }
    if (logging || logLock.current || rest.resting) return;
    logLock.current = true;
    setLogging(true);
    window.setTimeout(() => { logLock.current = false; setLogging(false); }, 400);
    haptic("tap");
    // Start at the tap, not after the network request completes.
    if (setNumber < targetSets) rest.start();
    const key = newSetKey();
    commitSets((prev) => [
      ...prev,
      { key, id: null, exercise_index: index, exercise_id: exercise.id, set_number: setNumber, weight_kg: entry.weight, reps: entry.reps, status: "syncing" },
    ]);
    usedExerciseIds.current[index] = exercise.id;
    setLastLog({ weight_kg: entry.weight, reps_completed: entry.reps });
    setSetNumber((n) => n + 1);
    // Auto-fill: keep this set's numbers ready for the next one.
    setWeight(String(entry.weight));
    setReps(String(entry.reps));
    void syncSet(key);
  };

  if (complete) return <WorkoutComplete summary={summary} exerciseCount={session.length} />;

  return (
    <div className="flex min-h-dvh flex-col bg-background px-7 pb-10 pt-14 text-foreground">
      {pr && <PersonalRecordDialog weight={pr.weight} name={pr.name} onClose={() => setPr(null)} />}
      {idle.show && <IdleNudge onDismiss={idle.dismiss} />}
      <OfflineSyncBadge className="mb-4" />
      <ExerciseDemo exerciseId={exercise?.id} name={exercise?.name} cues={buildCues(exercise)} />

      <div key={exercise?.id} className="mt-10 home-enter">
        <ExerciseHeading
          exercise={exercise}
          index={index}
          total={session.length}
          loaded={Boolean(workout)}
          superSore={superSore}
          targets={{ targetSets, targetReps, baseSets, baseReps }}
        />
        {exercise ? <MachineAlignment key={`machine-${exercise.id}`} exerciseId={exercise.id} /> : null}
        {exercise ? (
          <WarmUpCalculator key={`warmup-${exercise.id}`} exerciseId={exercise.id} weight={Number(weight) || 0} />
        ) : (
          <p className="mt-4 text-muted-foreground">{isLoading ? "Loading exercise details…" : "No exercise is assigned to this workout."}</p>
        )}
        {lastLog && (
          <ProgressionCard
            lastLog={lastLog}
            targetSets={targetSets}
            targetReps={targetReps}
            onUse={(w, r) => {
              setWeight(String(w));
              setReps(String(r));
            }}
          />
        )}
      </div>

      {/* Set logging inputs */}
      <div className="mt-10 grid grid-cols-1 gap-5 min-[380px]:grid-cols-2 min-[380px]:gap-3" role="group" aria-label="Log a set">
        <Stepper label="Weight (kg)" unit="kg" value={weight} onChange={setWeight} step={2.5} min={0} max={500} inputMode="decimal" />
        <Stepper label="Reps" unit="rep" value={reps} onChange={setReps} step={1} min={0} max={100} inputMode="numeric" />
      </div>
      <PlateVisualizer weight={Number(weight) || 0} />

      {/* After a swap, only the new exercise's sets (the set count restarts at 1). */}
      <LoggedSets sets={sets.filter((x) => x.exercise_index === index && x.exercise_id === exercise?.id)} onDelete={handleDeleteSet} onSaveEdit={saveEdit} />

      <div className="mt-8">
        <Button
          type="button"
          onClick={handleLogSet}
          disabled={logging || finishing || !exercise || rest.resting}
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

      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => requirePro(() => setSwapOpen(true))}
          disabled={!exercise}
          className="h-auto min-h-11 whitespace-normal rounded-lg px-6 py-3 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRightLeft aria-hidden="true" /> Both Machines Occupied? Swap Exercise{!isPro && " ⚡"}
        </Button>
      </div>

      <SwapDrawer
        open={swapOpen}
        onOpenChange={setSwapOpen}
        exerciseName={exercise?.name}
        loading={loadingOptions}
        options={swapOptions}
        onPick={handleSwap}
      />

      <div className="mt-auto pt-10">
        <Link
          to="/home"
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Back to home
        </Link>
      </div>
      {blocker.status === "blocked" && (
        <LeaveWorkoutDialog
          onStay={() => blocker.reset?.()}
          onAbandon={() => {
            abandoned.current = true;
            const savedIds = setsRef.current.flatMap((x) => (x.id ? [x.id] : []));
            // An upload still in flight finds its set gone and removes the server copy.
            commitSets(() => []);
            abandonActiveSession(savedIds);
            blocker.proceed?.();
          }}
        />
      )}
      {rest.resting && (
        <RestOverlay
          secondsLeft={rest.secondsLeft}
          restSecs={rest.restSecs}
          chimeMuted={rest.chimeMuted}
          onChangeLength={rest.changeLength}
          onToggleChime={rest.toggleChime}
          onSkip={rest.skip}
        />
      )}
    </div>
  );
}
