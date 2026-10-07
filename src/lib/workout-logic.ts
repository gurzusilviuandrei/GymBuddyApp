// Pure workout rules used by the tracker screen. No React, storage or network here,
// so every rule is unit-tested in workout-logic.test.ts.
import type { ActiveSession, CachedSet } from "./active-session";

export type Exercise = {
  id: string;
  name: string;
  instructions: string;
  setup_cue: string | null;
  position_cue: string | null;
  movement_cue: string | null;
  video_url: string | null;
  alternative_exercise_id: string | null;
  /** "Barbell" | "Dumbbell" | "Machine"; missing on workouts cached before it was loaded. */
  equipment_type?: string;
};

export const REST_OPTIONS = [45, 60, 90, 120] as const;
export const STEP_UP_KG = 2.5;

/**
 * The three setup/form cues shown for an exercise, with safe fallbacks. The first one
 * is "Machine Setup" only for a machine; barbells and dumbbells just have a "Setup".
 */
export function buildCues(exercise: Exercise | undefined): ReadonlyArray<readonly [string, string]> {
  if (!exercise) return [];
  return [
    [exercise.equipment_type === "Machine" ? "Machine Setup" : "Setup", exercise.setup_cue || "Choose a manageable load and check your equipment."],
    ["Starting Position", exercise.position_cue || "Get stable and brace your core before you move."],
    ["Key Movement Cue", exercise.movement_cue || exercise.instructions || "Move slowly and with control."],
  ] as const;
}

/**
 * "Super sore" auto-regulation: 3+ planned sets drop to 2; plans with fewer sets
 * keep them and trim 2 reps instead (never below 1).
 */
export function sessionTargets(baseSets: number, baseReps: number, superSore: boolean) {
  return {
    targetSets: superSore && baseSets >= 3 ? 2 : baseSets,
    targetReps: superSore && baseSets < 3 ? Math.max(1, baseReps - 2) : baseReps,
  };
}

export type LastLog = {
  weight_kg: number;
  reps_completed: number;
  sets_completed?: number;
  min_reps?: number;
  top_weight_kg?: number;
  /** Lightest weight used in that session (for assisted exercises the best one). */
  low_weight_kg?: number;
};

/**
 * Exercises where the weight entered is the machine's help, not the load lifted
 * (Assisted Pull-Up): a bigger number is easier, so progress means a smaller one.
 */
export function isAssistedExercise(exercise: { id?: string; name?: string } | null | undefined): boolean {
  return exercise?.id === "assisted-pullup" || /^assisted\b/i.test(exercise?.name ?? "");
}

/**
 * Step-up progression: suggest +2.5 kg only when every target set and rep landed
 * last time; otherwise repeat the weight and clean up form. For an assisted
 * exercise the step is 2.5 kg *less* assistance (never below 0), measured from
 * the least assistance used last time.
 */
export function progression(last: LastLog, targetSets: number, targetReps: number, assisted = false) {
  const base = assisted ? (last.low_weight_kg ?? last.weight_kg) : (last.top_weight_kg ?? last.weight_kg);
  const setsLast = last.sets_completed ?? 1;
  const repsLast = last.min_reps ?? last.reps_completed;
  const targetsHit = setsLast >= targetSets && repsLast >= targetReps;
  const next = assisted ? Math.max(0, base - STEP_UP_KG) : base + STEP_UP_KG;
  const stepUp = Math.round(next * 100) / 100;
  // Nothing left to take off: the member is already unassisted, so there is no step.
  const atLimit = assisted && base <= 0;
  const hitAll = targetsHit && !atLimit;
  return { base, setsLast, repsLast, hitAll, targetsHit, atLimit, assisted, stepUp, suggested: hitAll ? stepUp : base };
}

/** A new set from the inputs; null when the entry is not a loggable set. */
/** The database's limits for one set (workout_logs CHECK constraints). */
export const MAX_SET_WEIGHT_KG = 1000;
export const MAX_SET_REPS = 100;

/**
 * A new set, within the database's limits. A set outside them would be rejected
 * on every upload, stay "saved locally" forever and block finishing the workout.
 */
export function parseNewSet(weight: string, reps: string): { weight: number; reps: number } | null {
  return parseCorrection(weight, reps);
}

/**
 * A typed weight as a number, NaN when it isn't one. A single comma counts as the
 * decimal point, because phones in Romania and most of Europe type "22,5". Digits
 * and one separator only: no signs, exponents or thousands separators.
 */
export function parseWeightText(text: string): number {
  const t = text.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return NaN;
  return Number(t);
}

/** A correction to a logged set; same limits as a new set. */
export function parseCorrection(weight: string, reps: string): { weight: number; reps: number } | null {
  const w = parseWeightText(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w < 0 || w > MAX_SET_WEIGHT_KG || reps.trim() === "" || !Number.isInteger(r) || r < 1 || r > MAX_SET_REPS) return null;
  return { weight: w, reps: r };
}

/** Remove one set and renumber the rest of that exercise's sets 1, 2, 3… */
export function removeSet(sets: CachedSet[], key: string): CachedSet[] {
  const target = sets.find((x) => x.key === key);
  if (!target) return sets;
  let n = 0;
  return sets
    .filter((x) => x.key !== key)
    .map((x) => (x.exercise_index === target.exercise_index ? { ...x, set_number: ++n } : x));
}

/** Whole seconds of rest left, never negative. */
export function restRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Changing the rest length mid-rest moves the end by the difference. */
export function shiftRestEnd(endsAt: number, fromSecs: number, toSecs: number): number {
  return endsAt - fromSecs * 1000 + toSecs * 1000;
}

/** 90 → "1:30" */
export function formatClock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Whether a cached in-progress session belongs to the workout that just loaded. */
export function canResume(cached: ActiveSession | null, isCustom: boolean, exerciseCount: number): cached is ActiveSession {
  return Boolean(cached) && cached!.is_custom_workout === isCustom && cached!.current_exercise_index < exerciseCount;
}

/**
 * The weight and reps of the last set logged for an exercise, to pre-fill the inputs.
 * After a swap the slot holds a different exercise: only its own sets count.
 */
export function lastSetFor(sets: CachedSet[], exerciseIndex: number, exerciseId: string): CachedSet | undefined {
  return [...sets].reverse().find((s) => s.exercise_index === exerciseIndex && s.exercise_id === exerciseId);
}

/**
 * Every exercise that has sets in this workout, in plan order (and, within a slot,
 * in the order they were done), so an exercise swapped out after a few sets
 * still appears in the saved workout next to the one that replaced it.
 */
export function exercisesDone(sets: CachedSet[]): string[] {
  const ordered = [...sets].sort((a, b) => a.exercise_index - b.exercise_index);
  return [...new Set(ordered.map((s) => s.exercise_id))];
}

/** Unique per set on this device; makes retried uploads idempotent on the server. */
export function newSetKey(now = Date.now(), random = Math.random()): string {
  return `${now}-${random.toString(36).slice(2, 8)}`;
}

/** An unfinished workout this long after its last activity is treated as forgotten. */
export const STALE_WORKOUT_MS = 12 * 60 * 60 * 1000;

/** When the member last did something in this workout: the last set, else its start. */
export function lastActivityMs(s: Pick<ActiveSession, "last_set_at" | "session_start_time">): number {
  if (typeof s.last_set_at === "number" && Number.isFinite(s.last_set_at)) return s.last_set_at;
  const started = Date.parse(s.session_start_time);
  return Number.isFinite(started) ? started : 0;
}

/** More than 12 hours since the last activity: don't resume it silently. */
export function isStaleWorkout(s: Pick<ActiveSession, "last_set_at" | "session_start_time">, now = Date.now()): boolean {
  return now - lastActivityMs(s) > STALE_WORKOUT_MS;
}

/** Whole minutes between start and now, at least 1. */
export function durationMinutes(startedAt: string, now = Date.now()): number {
  return Math.max(1, Math.round((now - new Date(startedAt).getTime()) / 60_000));
}
