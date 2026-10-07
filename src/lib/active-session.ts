// Mid-workout recovery cache. Browser-only: call from effects or handlers.
import { durableStorage } from "@/lib/durable-storage";
import { addPendingDelete, writeOfflineQueue } from "@/lib/offline-queue";

export const ACTIVE_SESSION_KEY = "gymbuddy-active-session";

export type CachedExercise = {
  id: string;
  name: string;
  instructions: string;
  setup_cue: string | null;
  position_cue: string | null;
  movement_cue: string | null;
  video_url: string | null;
  alternative_exercise_id: string | null;
};

export interface ActiveSession {
  current_exercise_index: number;
  current_set_number: number;
  is_custom_workout: boolean;
  swapped_exercises_map: Record<number, CachedExercise>;
  session_start_time: string;
  total_exercises: number;
  logged_set_ids: string[];
  logged_sets?: CachedSet[];
  /** When (ms since epoch) the member last logged a set; decides if an old workout was forgotten. */
  last_set_at?: number;
}

export type CachedSet = {
  key: string;
  id: string | null;
  exercise_index: number;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  /** "refused": the database rejected these numbers; it waits for a correction, not for signal. */
  status: "saved" | "local" | "syncing" | "refused";
};

export function readActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = durableStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveSession;
    if (typeof s.current_exercise_index !== "number" || !s.session_start_time) return null;
    return {
      ...s,
      swapped_exercises_map: s.swapped_exercises_map ?? {},
      logged_set_ids: s.logged_set_ids ?? [],
      logged_sets: (s.logged_sets ?? []).map((x) => (x.status === "syncing" ? { ...x, status: "local" as const } : x)),
    };
  } catch {
    return null;
  }
}

export function writeActiveSession(s: ActiveSession) {
  try {
    durableStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked */
  }
}

export function clearActiveSession() {
  try {
    durableStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Abandon the workout in progress. Its sets must not count anywhere (stats,
 * history, next week's weights), so the ones that already reached the account are
 * queued for deletion (this works offline, and the database never deletes sets of
 * a finished workout), and the ones that never left the phone are dropped.
 * Deletions already waiting are kept, so a set removed earlier can't come back.
 */
export function abandonActiveSession(savedSetIds: string[] = []) {
  const s = readActiveSession();
  const ids = new Set([
    ...savedSetIds,
    ...(s?.logged_set_ids ?? []),
    ...(s?.logged_sets ?? []).flatMap((x) => (x.id ? [x.id] : [])),
  ]);
  for (const id of ids) addPendingDelete(id);
  clearActiveSession();
  writeOfflineQueue([]);
}
