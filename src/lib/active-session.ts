// Mid-workout recovery cache. Browser-only: call from effects or handlers.
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
  used_exercise_ids: Record<number, string>;
  logged_sets?: CachedSet[];
}

export type CachedSet = {
  key: string;
  id: string | null;
  exercise_index: number;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  status: "saved" | "local" | "syncing";
};

export function readActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ActiveSession;
    if (typeof s.current_exercise_index !== "number" || !s.session_start_time) return null;
    return {
      ...s,
      swapped_exercises_map: s.swapped_exercises_map ?? {},
      logged_set_ids: s.logged_set_ids ?? [],
      used_exercise_ids: s.used_exercise_ids ?? {},
      logged_sets: (s.logged_sets ?? []).map((x) => (x.status === "syncing" ? { ...x, status: "local" as const } : x)),
    };
  } catch {
    return null;
  }
}

export function writeActiveSession(s: ActiveSession) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked */
  }
}

export function clearActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
