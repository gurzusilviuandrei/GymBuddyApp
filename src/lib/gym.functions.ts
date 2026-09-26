import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FREQ_DAYS: Record<string, number> = { "2-days": 2, "3-days": 3, "4-plus": 4 };

const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(60),
  age: z.number().int().min(10).max(100),
  frequency: z.enum(["2-days", "3-days", "4-plus"]),
  primary_goal: z.enum(["lose-weight", "gain-muscle", "sports-performance"]),
  equipment_type: z.enum(["full-gym", "dumbbells", "barbell"]),
});

export const createUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data) => profileSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("users")
      .insert({
        full_name: data.full_name,
        age: data.age,
        weekly_goal_days: FREQ_DAYS[data.frequency] ?? 3,
        primary_goal: data.primary_goal,
        equipment_type: data.equipment_type,
      })
      .select("id")
      .single();
    if (error) throw new Error("Could not save profile");
    return { id: row.id as string };
  });

export const getActiveExercise = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("equipment_type")
      .eq("id", data.user_id)
      .maybeSingle();
    if (!user) return null;
    const { data: program } = await supabaseAdmin
      .from("workout_programs")
      .select("exercise_ids_list")
      .eq("equipment_type", user.equipment_type)
      .eq("day_number", 1)
      .maybeSingle();
    const exerciseId = program?.exercise_ids_list?.[0];
    if (!exerciseId) return null;
    const { data: exercise } = await supabaseAdmin
      .from("exercises")
      .select("id, name, instructions")
      .eq("id", exerciseId)
      .maybeSingle();
    return exercise;
  });

const logSchema = z.object({
  user_id: z.string().uuid(),
  exercise_id: z.string().min(1).max(64),
  weight_kg: z.number().min(0).max(1000),
  reps_completed: z.number().int().min(1).max(100),
  set_number: z.number().int().min(1).max(50),
});

export const logWorkoutSet = createServerFn({ method: "POST" })
  .inputValidator((data) => logSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("workout_logs")
      .insert(data)
      .select("id, set_number")
      .single();
    if (error) throw new Error("Could not log set");
    return row;
  });
