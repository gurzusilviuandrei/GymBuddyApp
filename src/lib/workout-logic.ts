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
};

export const REST_OPTIONS = [45, 60, 90, 120] as const;
export const STEP_UP_KG = 2.5;

/** The three setup/form cues shown for an exercise, with safe fallbacks. */
export function buildCues(exercise: Exercise | undefined): ReadonlyArray<readonly [string, string]> {
  if (!exercise) return [];
  return [
    ["Machine Setup", exercise.setup_cue || "Choose a manageable load and check your equipment."],
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
};

/**
 * Step-up progression: suggest +2.5 kg only when every target set and rep landed
 * last time; otherwise repeat the weight and clean up form.
 */
export function progression(last: LastLog, targetSets: number, targetReps: number) {
  const base = last.top_weight_kg ?? last.weight_kg;
  const setsLast = last.sets_completed ?? 1;
  const repsLast = last.min_reps ?? last.reps_completed;
  const hitAll = setsLast >= targetSets && repsLast >= targetReps;
  const stepUp = Math.round((base + STEP_UP_KG) * 100) / 100;
  return { base, setsLast, repsLast, hitAll, stepUp, suggested: hitAll ? stepUp : base };
}

/** A new set from the inputs; null when the entry is not a loggable set. */
export function parseNewSet(weight: string, reps: string): { weight: number; reps: number } | null {
  const w = Number(weight);
  const r = Number(reps);
  if (weight === "" || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r < 1) return null;
  return { weight: w, reps: r };
}

/** A correction to a logged set; stricter bounds matching the database limits. */
export function parseCorrection(weight: string, reps: string): { weight: number; reps: number } | null {
  const w = Number(weight);
  const r = Number(reps);
  if (weight === "" || !Number.isFinite(w) || w < 0 || w > 1000 || !Number.isInteger(r) || r < 1 || r > 100) return null;
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

/** The weight and reps of the last set logged for an exercise, to pre-fill the inputs. */
export function lastSetFor(sets: CachedSet[], exerciseIndex: number): CachedSet | undefined {
  return [...sets].reverse().find((s) => s.exercise_index === exerciseIndex);
}

/** Unique per set on this device; makes retried uploads idempotent on the server. */
export function newSetKey(now = Date.now(), random = Math.random()): string {
  return `${now}-${random.toString(36).slice(2, 8)}`;
}

/** Whole minutes between start and now, at least 1. */
export function durationMinutes(startedAt: string, now = Date.now()): number {
  return Math.max(1, Math.round((now - new Date(startedAt).getTime()) / 60_000));
}
