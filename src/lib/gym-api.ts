// GymBuddy data API. Reads go straight to Supabase (row-level security limits every
// member to their own rows); writes call the database functions in
// supabase/migrations/*_standalone_api.sql, which act as the signed-in member.
// Each call takes `{ data }` so screens call it like the old server functions.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { activityDays, heatmapLookbackMs } from "@/lib/activity";
import { groupSessionSets, type SessionLogRow } from "@/lib/session-detail";
import { isRefusalCode, ServerRefusedError } from "@/lib/server-refusal";
import { profileFromRow, type TrainingProfile } from "@/lib/training-profile";
import { isWeightUnit, type WeightUnit } from "@/lib/weight-units";

type Input<T> = { data: T };
type DbFunction = keyof Database["public"]["Functions"];

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Unauthorized");
  return id;
}

// Function names are checked against the database types; the result shape is
// declared per call (the functions return jsonb).
async function call<T>(fn: DbFunction, args: Record<string, unknown>, fallback: string): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rpc's overloads don't accept a generic name
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) {
    console.error(fn, error.code, error.message);
    // Raised exceptions carry a member-facing message; anything else gets the fallback.
    const message = error.code === "P0001" && error.message ? error.message : fallback;
    // A value the database will never accept is final, unlike a dropped connection.
    throw isRefusalCode(error.code) ? new ServerRefusedError(message) : new Error(message);
  }
  return data as T;
}

const SPLIT_FOCUS: Record<SplitDay, string> = {
  A: "Squat Focus · Horizontal Press · Horizontal Pull",
  B: "Hip Hinge Focus · Vertical Press · Vertical Pull",
  C: "Leg Press / Machine Squat · Incline Press · Arms & Core",
};
const SPLIT_DAY_NUMBER: Record<SplitDay, number> = { A: 1, B: 2, C: 3 };
export type SplitDay = "A" | "B" | "C";

const EX_FIELDS = "id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id, equipment_type";

// ── Profile ────────────────────────────────────────────────────────────────

export type EnsureUserResult = {
  userId: string;
  accountMissing: boolean;
  onboarded: boolean;
  fullName: string | null;
  frequency: string | null;
  goal: string | null;
  equipment: string | null;
};

export function ensureUserRow(): Promise<EnsureUserResult> {
  return call<EnsureUserResult>("ensure_user_row", {}, "Could not create account profile");
}

export async function createUserProfile({ data }: Input<{
  full_name: string;
  age: number;
  frequency: "2-days" | "3-days" | "4-plus";
  primary_goal: "lose-weight" | "gain-muscle" | "sports-performance";
  equipment_type: "full-gym" | "dumbbells" | "barbell";
  /** Left out by older app builds; the database then keeps kilograms (or the existing choice). */
  weight_unit?: WeightUnit | undefined;
}>) {
  const id = await call<string>(
    "create_user_profile",
    {
      p_full_name: data.full_name,
      p_age: data.age,
      p_frequency: data.frequency,
      p_primary_goal: data.primary_goal,
      p_equipment_type: data.equipment_type,
      p_weight_unit: data.weight_unit,
    },
    "Could not save profile",
  );
  return { id };
}

/** The signed-in member's training answers, for the edit form. Fails rather than return "nothing" on an error. */
export async function getTrainingProfile(): Promise<TrainingProfile> {
  const userId = await currentUserId();
  const { data: row, error } = await supabase
    .from("users")
    .select("full_name, age, weekly_goal_days, primary_goal, equipment_type, weight_unit")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load your training profile");
  const profile = row ? profileFromRow(row) : null;
  if (!profile) throw new Error("Finish setting up your profile first");
  return profile;
}

/** The member's chosen weight unit. Fails rather than guess, so a hiccup never flips every weight on screen. */
export async function getWeightUnit(): Promise<WeightUnit> {
  const userId = await currentUserId();
  const { data: row, error } = await supabase.from("users").select("weight_unit").eq("id", userId).maybeSingle();
  if (error) throw new Error("Could not load your weight unit");
  return isWeightUnit(row?.weight_unit) ? row.weight_unit : "kg";
}

/** Saves the edit form. `restarted` is true when changing equipment sent the plan back to Day A. */
export function updateTrainingProfile({ data }: Input<TrainingProfile>) {
  return call<{ equipment: string; restarted: boolean; weightUnit: WeightUnit }>(
    "update_training_profile",
    {
      p_full_name: data.name,
      p_age: data.age,
      p_frequency: data.frequency,
      p_primary_goal: data.goal,
      p_equipment_type: data.equipment,
      p_weight_unit: data.weightUnit,
    },
    "Could not save your profile",
  );
}

// ── Workout plan ───────────────────────────────────────────────────────────

// mode "premade"/"custom" lets the dashboard launch either program on demand;
// "auto" uses the custom routine when one is active, else the pre-made plan.
export async function getDayOneWorkout({ data }: Input<{ mode?: "auto" | "premade" | "custom" | undefined }>) {
  const userId = await currentUserId();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("equipment_type, is_custom, custom_exercise_ids, next_split_day")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw new Error("Could not load profile");
  if (!user?.equipment_type) return null;
  const splitDay = (["A", "B", "C"].includes(user.next_split_day) ? user.next_split_day : "A") as SplitDay;
  const { data: baseProgram, error: programError } = await supabase
    .from("workout_programs")
    .select("id, day_number, exercise_ids_list, target_sets, target_reps")
    .eq("equipment_type", user.equipment_type)
    .eq("day_number", SPLIT_DAY_NUMBER[splitDay])
    .maybeSingle();
  if (programError) throw new Error("Could not load workout program");
  const hasCustom = user.is_custom && (user.custom_exercise_ids?.length ?? 0) > 0;
  const useCustom = data.mode === "premade" ? false : hasCustom;
  const program = useCustom
    ? {
        id: baseProgram?.id ?? "custom",
        day_number: 1,
        target_sets: baseProgram?.target_sets ?? 3,
        target_reps: baseProgram?.target_reps ?? 10,
        exercise_ids_list: user.custom_exercise_ids,
      }
    : baseProgram;
  if (!program || program.exercise_ids_list.length === 0) return null;

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from("exercises")
    .select(EX_FIELDS)
    .in("id", program.exercise_ids_list);
  if (exercisesError) throw new Error("Could not load exercises");

  const exerciseById = new Map((exerciseRows ?? []).map((exercise) => [exercise.id, exercise]));
  const exercises = program.exercise_ids_list.flatMap((id) => {
    const exercise = exerciseById.get(id);
    return exercise ? [exercise] : [];
  });

  return {
    id: program.id,
    day_number: program.day_number,
    target_sets: program.target_sets,
    target_reps: program.target_reps,
    exercise_ids: program.exercise_ids_list,
    exercises,
    is_custom: useCustom,
    split_day: splitDay,
    split_focus: SPLIT_FOCUS[splitDay],
  };
}

export async function getExerciseLibrary() {
  const userId = await currentUserId();
  const [{ data: rows, error }, { data: user, error: userError }] = await Promise.all([
    supabase.from("exercises").select("id, name, movement_type, equipment_type, target").order("name"),
    supabase.from("users").select("custom_exercise_ids").eq("id", userId).maybeSingle(),
  ]);
  // An unreadable routine must not open as empty: saving it would wipe the real one.
  if (error || userError) throw new Error("Could not load exercises");
  return { exercises: rows ?? [], selected: user?.custom_exercise_ids ?? [] };
}

export async function saveCustomRoutine({ data }: Input<{ exercise_ids: string[] }>) {
  await call<null>("save_custom_routine", { p_exercise_ids: data.exercise_ids }, "Could not save routine");
  return { ok: true };
}

// Up to 4 alternatives sharing the movement pattern; the curated one comes first. Pro only.
export function getAlternativeOptions({ data }: Input<{ exercise_id: string; exclude?: string[] | undefined }>) {
  return call<
    {
      id: string;
      name: string;
      instructions: string;
      setup_cue: string | null;
      position_cue: string | null;
      movement_cue: string | null;
      video_url: string | null;
      alternative_exercise_id: string | null;
      equipment_type: string;
      movement_type: string;
    }[]
  >("get_alternative_options", { p_exercise_id: data.exercise_id, p_exclude: data.exclude ?? [] }, "Could not load alternatives");
}

// ── Sets ───────────────────────────────────────────────────────────────────

export function logWorkoutSet({ data }: Input<{
  exercise_id: string;
  weight_kg: number;
  reps_completed: number;
  set_number: number;
  client_key?: string | undefined;
}>) {
  return call<{ id: string; set_number: number; is_personal_record: boolean }>(
    "log_workout_set",
    {
      p_exercise_id: data.exercise_id,
      p_weight_kg: data.weight_kg,
      p_reps_completed: data.reps_completed,
      p_set_number: data.set_number,
      p_client_key: data.client_key ?? null,
    },
    "Could not log set",
  );
}

export function updateWorkoutSet({ data }: Input<{ id: string; weight_kg: number; reps_completed: number }>) {
  return call<{ ok: boolean; is_personal_record: boolean; exercise_id: string }>(
    "update_workout_set",
    { p_id: data.id, p_weight_kg: data.weight_kg, p_reps_completed: data.reps_completed },
    "Could not update set",
  );
}

export async function deleteWorkoutSet({ data }: Input<{ id: string }>) {
  await call<null>("delete_workout_set", { p_id: data.id }, "Could not delete set");
  return { ok: true };
}

export async function getLastLog({ data }: Input<{ exercise_id: string }>) {
  const userId = await currentUserId();
  // Baseline ignores auto-regulated (recovery) sets so a light day never lowers next week's weights.
  const lastLogs = (baselineOnly: boolean) => {
    let q = supabase
      .from("workout_logs")
      .select("weight_kg, reps_completed, timestamp")
      .eq("user_id", userId)
      .eq("exercise_id", data.exercise_id);
    if (baselineOnly) q = q.eq("auto_regulated", false);
    return q.order("timestamp", { ascending: false }).limit(12);
  };
  const { data: base } = await lastLogs(true);
  const rows = base?.length ? base : ((await lastLogs(false)).data ?? []);
  const latest = rows[0];
  if (!latest) return null;
  // Keep only the sets from the most recent session for this exercise, so the
  // step-up suggestion reflects one whole session rather than mixed weeks.
  const dayOf = (ts: string) => new Date(ts).toDateString();
  const session = rows.filter((r) => dayOf(r.timestamp) === dayOf(latest.timestamp));
  const reps = session.map((r) => r.reps_completed);
  return {
    weight_kg: Number(latest.weight_kg),
    reps_completed: latest.reps_completed,
    sets_completed: session.length,
    min_reps: reps.length ? Math.min(...reps) : latest.reps_completed,
    top_weight_kg: Math.max(...session.map((r) => Number(r.weight_kg))),
    low_weight_kg: Math.min(...session.map((r) => Number(r.weight_kg))),
  };
}

// ── Machine settings ───────────────────────────────────────────────────────

export async function getMachineSetting({ data }: Input<{ exercise_id: string }>) {
  const userId = await currentUserId();
  const [{ data: ex, error: exError }, { data: row, error: rowError }] = await Promise.all([
    supabase.from("exercises").select("equipment_type").eq("id", data.exercise_id).maybeSingle(),
    supabase
      .from("user_machine_settings")
      .select("seat_notch, pad_notch, custom_setting_notes")
      .eq("user_id", userId)
      .eq("exercise_id", data.exercise_id)
      .maybeSingle(),
  ]);
  // Fail rather than answer "no settings": the cached notches stay on screen offline,
  // and a blank form can't be saved over the real ones.
  if (exError || rowError) throw new Error("Could not load your machine setup");
  return {
    is_machine: /machine|cable/i.test(ex?.equipment_type ?? ""),
    seat_notch: row?.seat_notch ?? "",
    pad_notch: row?.pad_notch ?? "",
    custom_setting_notes: row?.custom_setting_notes ?? "",
  };
}

export async function saveMachineSetting({ data }: Input<{
  exercise_id: string;
  seat_notch: string;
  pad_notch: string;
  custom_setting_notes: string;
}>) {
  await call<null>(
    "save_machine_setting",
    {
      p_exercise_id: data.exercise_id,
      p_seat_notch: data.seat_notch,
      p_pad_notch: data.pad_notch,
      p_custom_setting_notes: data.custom_setting_notes,
    },
    "Could not save your machine setup. Try again.",
  );
  return { saved: true };
}

// ── Stats & history ────────────────────────────────────────────────────────

// tz_offset is the device's Date.getTimezoneOffset() (minutes, UTC - local).
export async function getUserStats({ data }: Input<{ tz_offset?: number | undefined }>) {
  const userId = await currentUserId();
  // Start of the current week (Monday 00:00) in the member's local time.
  const offsetMs = (data.tz_offset ?? 0) * 60_000;
  const local = new Date(Date.now() - offsetMs);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - daysSinceMonday);
  local.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(local.getTime() + offsetMs);

  // A workout counts once it has been finished (completion screen reached).
  const [weekRes, setsRes, userRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("completed_at", weekStart.toISOString()),
    supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("users").select("weekly_goal_days").eq("id", userId).maybeSingle(),
  ]);
  // Surface failures so the screen keeps the last known numbers instead of showing zero.
  const failed = weekRes.error ?? setsRes.error ?? userRes.error;
  if (failed || weekRes.count == null || setsRes.count == null) {
    console.error("getUserStats failed", failed?.code, failed?.message);
    throw new Error("Could not load your weekly stats");
  }
  return {
    completedWorkouts: weekRes.count,
    totalLoggedSets: setsRes.count,
    weeklyTarget: userRes.data?.weekly_goal_days ?? 3,
  };
}

// The weekly streak on Home: when each finished workout ended (about 3 a week, so the
// newest 1,000 cover years) and the weekly goal; streak.ts does the counting on the phone.
export async function getStreakData() {
  const userId = await currentUserId();
  const [sessionsRes, userRes] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(1000),
    supabase.from("users").select("weekly_goal_days").eq("id", userId).maybeSingle(),
  ]);
  const failed = sessionsRes.error ?? userRes.error;
  if (failed) {
    console.error("getStreakData failed", failed.code, failed.message);
    throw new Error("Could not load your streak");
  }
  return {
    completedAts: (sessionsRes.data ?? []).map((s) => s.completed_at).filter((v): v is string => Boolean(v)),
    weeklyGoal: userRes.data?.weekly_goal_days ?? 3,
  };
}

// Records a finished workout from this session's logged set IDs, not unrelated logs.
export async function completeWorkout({ data }: Input<{
  program_type: "premade" | "custom";
  exercise_ids: string[];
  log_ids: string[];
  started_at: string;
  split_day?: SplitDay | undefined;
  auto_regulated?: boolean | undefined;
  /** A forgotten workout: end it at its last set instead of now (decided by the server). */
  end_at_last_set?: boolean | undefined;
}>) {
  const row = await call<{ id: string; sets: number; volume: number | string }>(
    "complete_workout",
    {
      p_program_type: data.program_type,
      p_exercise_ids: data.exercise_ids,
      p_log_ids: data.log_ids,
      p_started_at: data.started_at,
      p_split_day: data.split_day ?? null,
      p_auto_regulated: Boolean(data.auto_regulated),
      // Only sent for a forgotten workout, so normal finishes also work on a database
      // that doesn't have this option yet.
      ...(data.end_at_last_set ? { p_end_at_last_set: true } : {}),
    },
    "Could not save workout",
  );
  return { id: row.id, sets: row.sets, volume: Number(row.volume) };
}

export async function getWorkoutHistory({ data }: Input<{ limit?: number | undefined }>) {
  const userId = await currentUserId();
  const { data: rows, error } = await supabase
    .from("workout_sessions")
    .select("id, program_type, exercise_names, total_sets, total_volume_kg, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(data.limit ?? 100);
  if (error) {
    // Fail rather than return an empty list: the last loaded history (kept on the
    // device) stays on screen, instead of "No workouts yet" with no signal.
    console.error("getWorkoutHistory failed", error.code, error.message);
    throw new Error("Could not load your workouts");
  }
  return (rows ?? []).map((r) => ({
    id: r.id,
    completedAt: r.completed_at,
    program: r.program_type as "premade" | "custom",
    sets: r.total_sets,
    volume: Number(r.total_volume_kg),
    exercises: r.exercise_names,
  }));
}

// Removes one finished session; the weekly ring counts sessions, so it updates automatically.
export function deleteWorkoutSession({ data }: Input<{ session_id: string }>) {
  return call<{ deleted: boolean }>("delete_workout_session", { p_session_id: data.session_id }, "Could not delete that workout");
}

// Local calendar dates (YYYY-MM-DD) with a finished workout, for the History heatmap.
// Reads finished workouts (about three a week) rather than every logged set (about
// thirty a workout), so it stays far below the server's 1,000-row cap, and reads only
// the weeks the heatmap shows.
export async function getActivityDays() {
  const userId = await currentUserId();
  const since = new Date(Date.now() - heatmapLookbackMs()).toISOString();
  const { data: rows, error } = await supabase
    .from("workout_sessions")
    .select("completed_at")
    .eq("user_id", userId)
    .gte("completed_at", since)
    .order("completed_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Could not load activity");
  return activityDays((rows ?? []).map((r) => r.completed_at));
}

// Every set recorded during one finished session.
export async function getSessionDetail({ data }: Input<{ session_id: string }>) {
  const userId = await currentUserId();
  const { data: session, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("started_at, completed_at")
    .eq("id", data.session_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError) throw new Error("Could not load workout details");
  if (!session) return [];
  const cols = "id, exercise_id, set_number, weight_kg, reps_completed, timestamp, exercises(name)";
  let { data: logs, error } = await supabase
    .from("workout_logs")
    .select(cols)
    .eq("user_id", userId)
    .eq("session_id", data.session_id)
    .order("timestamp");
  if (!error && (logs ?? []).length === 0) {
    // Legacy sessions saved before direct linkage: fall back to unlinked sets in the window.
    ({ data: logs, error } = await supabase
      .from("workout_logs")
      .select(cols)
      .eq("user_id", userId)
      .is("session_id", null)
      .gte("timestamp", session.started_at)
      .lte("timestamp", session.completed_at)
      .order("timestamp"));
  }
  if (error) throw new Error("Could not load workout details");
  return groupSessionSets((logs ?? []) as SessionLogRow[]);
}

// Best estimated 1RM (Epley) per training day over the last 8 weeks. Pro only.
export async function getExerciseProgress({ data }: Input<{ exercise_id: string; tz_offset: number }>) {
  const rows = await call<{ date: string; e1rm: number | string; weight: number | string; reps: number }[]>(
    "get_exercise_progress",
    { p_exercise_id: data.exercise_id, p_tz_offset: data.tz_offset },
    "Could not load progress",
  );
  return rows.map((r) => ({ date: r.date, e1rm: Number(r.e1rm), weight: Number(r.weight), reps: r.reps }));
}
