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
    if (upErr) throw new Error("Could not create account profile");
    const { data: row } = await supabaseAdmin
      .from("users")
      .select("full_name, weekly_goal_days, primary_goal, equipment_type")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      userId: context.userId,
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

export const getDayOneWorkout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("equipment_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (userError) throw new Error("Could not load profile");
    if (!user) return null;
    const { data: program, error: programError } = await supabaseAdmin
      .from("workout_programs")
      .select("id, day_number, exercise_ids_list, target_sets, target_reps")
      .eq("equipment_type", user.equipment_type)
      .eq("day_number", 1)
      .maybeSingle();
    if (programError) throw new Error("Could not load workout program");
    if (!program || program.exercise_ids_list.length === 0) return null;

    const { data: exerciseRows, error: exercisesError } = await supabaseAdmin
      .from("exercises")
      .select("id, name, instructions, video_url, alternative_exercise_id")
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
    };
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
      .select("id, name, instructions, video_url, alternative_exercise_id")
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

    const { data: logs } = await supabaseAdmin
      .from("workout_logs")
      .select("timestamp")
      .eq("user_id", context.userId)
      .gte("timestamp", sunday.toISOString());

    const uniqueDays = new Set(logs?.map((l) => new Date(l.timestamp).toDateString())).size;
    
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("weekly_goal_days")
      .eq("id", context.userId)
      .maybeSingle();

    return {
      completedWorkouts: uniqueDays,
      weeklyTarget: user?.weekly_goal_days ?? 3,
    };
  });
