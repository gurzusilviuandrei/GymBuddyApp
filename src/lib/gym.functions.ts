import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAYS_FREQ: Record<number, string> = { 2: "2-days", 3: "3-days", 4: "4-plus" };

export const ensureUserRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("users")
      .upsert({ id: context.userId }, { onConflict: "id", ignoreDuplicates: true });
    if (upErr) {
      console.error("ensureUserRow upsert failed", upErr.code, upErr.message);
      // 23503 = the signed-in account no longer exists (e.g. deleted) but the
      // browser still holds its old session. Tell the client to sign out.
      if (upErr.code === "23503") {
        return {
          userId: context.userId,
          accountMissing: true as const,
          onboarded: false,
          fullName: null,
          frequency: null,
          goal: null,
          equipment: null,
        };
      }
      throw new Error("Could not create account profile");
    }
    const { data: row } = await supabaseAdmin
      .from("users")
      .select("full_name, weekly_goal_days, primary_goal, equipment_type")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      userId: context.userId,
      accountMissing: false as const,
      onboarded: Boolean(row?.equipment_type),
      fullName: row?.full_name ?? null,
      frequency: row?.weekly_goal_days ? (DAYS_FREQ[row.weekly_goal_days] ?? null) : null,
      goal: row?.primary_goal ?? null,
      equipment: row?.equipment_type ?? null,
    };
  });

const FREQ_DAYS: Record<string, number> = { "2-days": 2, "3-days": 3, "4-plus": 4 };

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(60),
  age: z.number().int().min(10).max(100),
  frequency: z.enum(["2-days", "3-days", "4-plus"]),
  primary_goal: z.enum(["lose-weight", "gain-muscle", "sports-performance"]),
  equipment_type: z.enum(["full-gym", "dumbbells", "barbell"]),
});

export const createUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => profileSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("users")
      .upsert({
        id: context.userId,
        full_name: data.full_name,
        age: data.age,
        weekly_goal_days: FREQ_DAYS[data.frequency] ?? 3,
        primary_goal: data.primary_goal,
        equipment_type: data.equipment_type,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not save profile");
    return { id: context.userId };
  });

// mode "premade"/"custom" lets the dashboard launch either program on demand;
// "auto" keeps the previous behaviour (custom when active, else pre-made).
export const getDayOneWorkout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        user_id: z.string().optional(),
        mode: z.enum(["auto", "premade", "custom"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("equipment_type, is_custom, custom_exercise_ids")
      .eq("id", context.userId)
      .maybeSingle();
    if (userError) throw new Error("Could not load profile");
    if (!user?.equipment_type) return null;
    const { data: baseProgram, error: programError } = await supabaseAdmin
      .from("workout_programs")
      .select("id, day_number, exercise_ids_list, target_sets, target_reps")
      .eq("equipment_type", user.equipment_type)
      .eq("day_number", 1)
      .maybeSingle();
    if (programError) throw new Error("Could not load workout program");
    const hasCustom = user.is_custom && (user.custom_exercise_ids?.length ?? 0) > 0;
    const useCustom = data.mode === "premade" ? false : data.mode === "custom" ? hasCustom : hasCustom;
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

    const { data: exerciseRows, error: exercisesError } = await supabaseAdmin
      .from("exercises")
      .select("id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id")
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
    };
  });

export const getExerciseLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rows, error }, { data: user }] = await Promise.all([
      context.supabase.from("exercises").select("id, name, movement_type, equipment_type, target").order("name"),
      context.supabase.from("users").select("custom_exercise_ids").eq("id", context.userId).maybeSingle(),
    ]);
    if (error) throw new Error("Could not load exercises");
    return { exercises: rows ?? [], selected: user?.custom_exercise_ids ?? [] };
  });

export const saveCustomRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ exercise_ids: z.array(z.string().min(1).max(64)).min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (new Set(data.exercise_ids).size !== data.exercise_ids.length) throw new Error("Pick different exercises");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: found, error: lookupError } = await supabaseAdmin.from("exercises").select("id").in("id", data.exercise_ids);
    if (lookupError || (found?.length ?? 0) !== data.exercise_ids.length) throw new Error("Unknown exercise");
    const { data: updated, error } = await supabaseAdmin
      .from("users")
      .update({ is_custom: true, custom_exercise_ids: data.exercise_ids })
      .eq("id", context.userId)
      .select("id")
      .maybeSingle();
    if (error || !updated) throw new Error("Could not save routine");
    return { ok: true };
  });

export const getAlternativeExercise = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ exercise_id: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin
      .from("exercises")
      .select("alternative_exercise_id")
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (!current?.alternative_exercise_id) return null;
    const { data: alt } = await supabaseAdmin
      .from("exercises")
      .select("id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id")
      .eq("id", current.alternative_exercise_id)
      .maybeSingle();
    return alt;
  });

const logSchema = z.object({
  user_id: z.string().optional(),
  exercise_id: z.string().min(1).max(64),
  weight_kg: z.number().min(0).max(1000),
  reps_completed: z.number().int().min(1).max(100),
  set_number: z.number().int().min(1).max(50),
});

export const logWorkoutSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => logSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("workout_logs")
      .insert({ exercise_id: data.exercise_id, weight_kg: data.weight_kg, reps_completed: data.reps_completed, set_number: data.set_number, user_id: context.userId })
      .select("id, set_number")
      .single();
    if (error) throw new Error("Could not log set");
    return row;
  });

export const getLastLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: z.string().optional(), exercise_id: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("workout_logs")
      .select("weight_kg, reps_completed")
      .eq("user_id", context.userId)
      .eq("exercise_id", data.exercise_id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ? { weight_kg: Number(row.weight_kg), reps_completed: row.reps_completed } : null;
  });

export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Get start of current week (Sunday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    const sunday = new Date(now.setDate(diff));
    sunday.setHours(0, 0, 0, 0);

    // A workout counts once it has been finished (completion screen reached).
    const { count } = await supabaseAdmin
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("completed_at", sunday.toISOString());

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("weekly_goal_days")
      .eq("id", context.userId)
      .maybeSingle();

    return {
      completedWorkouts: count ?? 0,
      weeklyTarget: user?.weekly_goal_days ?? 3,
    };
  });

// Records a finished workout from this session's logged set IDs, not unrelated logs.
export const completeWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        program_type: z.enum(["premade", "custom"]),
        exercise_ids: z.array(z.string().min(1).max(64)).min(1),
        log_ids: z.array(z.string().uuid()).min(1),
        started_at: z.string().datetime(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const started = new Date(data.started_at);
    const earliest = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const startedAt = started < earliest ? earliest : started;

    if (new Set(data.log_ids).size !== data.log_ids.length) throw new Error("Duplicate logged sets");
    const logs = [] as { exercise_id: string; weight_kg: number; reps_completed: number }[];
    for (let offset = 0; offset < data.log_ids.length; offset += 200) {
      const { data: batch, error: logErr } = await supabaseAdmin
        .from("workout_logs")
        .select("exercise_id, weight_kg, reps_completed")
        .eq("user_id", context.userId)
        .gte("timestamp", startedAt.toISOString())
        .in("id", data.log_ids.slice(offset, offset + 200));
      if (logErr || !batch || batch.length !== Math.min(200, data.log_ids.length - offset)) throw new Error("Could not read all logged sets");
      logs.push(...batch);
    }

    const ids = Array.from(new Set([...data.exercise_ids, ...logs.map((l) => l.exercise_id)]));
    const { data: rows } = await supabaseAdmin.from("exercises").select("id, name").in("id", ids);
    const nameById = new Map((rows ?? []).map((r) => [r.id, r.name]));
    const doneIds = new Set(logs.map((l) => l.exercise_id));
    const names = data.exercise_ids.filter((id) => doneIds.has(id)).map((id) => nameById.get(id) ?? id);
    const volume = logs.reduce((s, l) => s + Number(l.weight_kg) * l.reps_completed, 0);

    const { data: row, error } = await supabaseAdmin
      .from("workout_sessions")
      .insert({
        user_id: context.userId,
        program_type: data.program_type,
        exercise_names: names,
        total_sets: logs.length,
        total_volume_kg: volume,
        started_at: startedAt.toISOString(),
      })
      .select("id, total_sets, total_volume_kg")
      .single();
    if (error) {
      console.error("completeWorkout insert failed", error.code, error.message);
      throw new Error("Could not save workout");
    }
    return { id: row.id, sets: row.total_sets, volume: Number(row.total_volume_kg) };
  });

export const getWorkoutHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("workout_sessions")
      .select("id, program_type, exercise_names, total_sets, total_volume_kg, completed_at")
      .eq("user_id", context.userId)
      .order("completed_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error("Could not load workout history");
    return (rows ?? []).map((r) => ({
      id: r.id,
      completedAt: r.completed_at,
      program: r.program_type as "premade" | "custom",
      sets: r.total_sets,
      volume: Number(r.total_volume_kg),
      exercises: r.exercise_names,
    }));
  });
