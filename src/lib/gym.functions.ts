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
  .validator((data) => profileSchema.parse(data))
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

export type SplitDay = "A" | "B" | "C";
const SPLIT_DAY_NUMBER: Record<SplitDay, number> = { A: 1, B: 2, C: 3 };
const NEXT_SPLIT: Record<SplitDay, SplitDay> = { A: "B", B: "C", C: "A" };
const SPLIT_FOCUS: Record<SplitDay, string> = {
  A: "Squat Focus · Horizontal Press · Horizontal Pull",
  B: "Hip Hinge Focus · Vertical Press · Vertical Pull",
  C: "Leg Press / Machine Squat · Incline Press · Arms & Core",
};

// mode "premade"/"custom" lets the dashboard launch either program on demand;
// "auto" keeps the previous behaviour (custom when active, else pre-made).
export const getDayOneWorkout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
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
      .select("equipment_type, is_custom, custom_exercise_ids, next_split_day")
      .eq("id", context.userId)
      .maybeSingle();
    if (userError) throw new Error("Could not load profile");
    if (!user?.equipment_type) return null;
    const splitDay = (["A", "B", "C"].includes(user.next_split_day) ? user.next_split_day : "A") as SplitDay;
    const { data: baseProgram, error: programError } = await supabaseAdmin
      .from("workout_programs")
      .select("id, day_number, exercise_ids_list, target_sets, target_reps")
      .eq("equipment_type", user.equipment_type)
      .eq("day_number", SPLIT_DAY_NUMBER[splitDay])
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
      split_day: splitDay,
      split_focus: SPLIT_FOCUS[splitDay],
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
  .validator((data) =>
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
  .validator((data) => z.object({ exercise_id: z.string().min(1).max(64) }).parse(data))
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
  client_key: z.string().min(1).max(100).optional(),
});

export const logWorkoutSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => logSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // All-time peak for this exercise, ignoring this same set on retries.
    const { data: peaks } = await supabaseAdmin
      .from("workout_logs")
      .select("weight_kg, client_key")
      .eq("user_id", context.userId)
      .eq("exercise_id", data.exercise_id)
      .order("weight_kg", { ascending: false })
      .limit(2);
    const prev = (peaks ?? []).find((p) => !data.client_key || p.client_key !== data.client_key);
    const is_personal_record = Boolean(prev) && data.weight_kg > Number(prev!.weight_kg);
    const values = { exercise_id: data.exercise_id, weight_kg: data.weight_kg, reps_completed: data.reps_completed, set_number: data.set_number, user_id: context.userId, is_personal_record };
    // Idempotent: a retried set with the same client key updates the one row instead of duplicating it.
    const { data: row, error } = data.client_key
      ? await supabaseAdmin
          .from("workout_logs")
          .upsert({ ...values, client_key: data.client_key }, { onConflict: "user_id,client_key" })
          .select("id, set_number, is_personal_record")
          .single()
      : await supabaseAdmin.from("workout_logs").insert(values).select("id, set_number, is_personal_record").single();
    if (error) throw new Error("Could not log set");
    return row;
  });

export const updateWorkoutSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        id: z.string().uuid(),
        weight_kg: z.number().min(0).max(1000),
        reps_completed: z.number().int().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workout_logs")
      .update({ weight_kg: data.weight_kg, reps_completed: data.reps_completed })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not update set");
    return { ok: true };
  });

export const deleteWorkoutSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("workout_logs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete set");
    return { ok: true };
  });

export const getLastLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ user_id: z.string().optional(), exercise_id: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Baseline ignores auto-regulated (recovery) sets so a light day never lowers next week's weights.
    const lastLog = (baselineOnly: boolean) => {
      let q = supabaseAdmin
        .from("workout_logs")
        .select("weight_kg, reps_completed")
        .eq("user_id", context.userId)
        .eq("exercise_id", data.exercise_id);
      if (baselineOnly) q = q.eq("auto_regulated", false);
      return q.order("timestamp", { ascending: false }).limit(1).maybeSingle();
    };
    const { data: base } = await lastLog(true);
    const row = base ?? (await lastLog(false)).data;
    return row ? { weight_kg: Number(row.weight_kg), reps_completed: row.reps_completed } : null;
  });

export const getMachineSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ exercise_id: z.string().min(1).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ex }, { data: row }] = await Promise.all([
      supabaseAdmin.from("exercises").select("equipment_type").eq("id", data.exercise_id).maybeSingle(),
      supabaseAdmin
        .from("user_machine_settings")
        .select("seat_notch, pad_notch, custom_setting_notes")
        .eq("user_id", context.userId)
        .eq("exercise_id", data.exercise_id)
        .maybeSingle(),
    ]);
    return {
      is_machine: /machine|cable/i.test(ex?.equipment_type ?? ""),
      seat_notch: row?.seat_notch ?? "",
      pad_notch: row?.pad_notch ?? "",
      custom_setting_notes: row?.custom_setting_notes ?? "",
    };
  });

export const saveMachineSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        exercise_id: z.string().min(1).max(64),
        seat_notch: z.string().trim().max(8),
        pad_notch: z.string().trim().max(8),
        custom_setting_notes: z.string().trim().max(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_machine_settings").upsert(
      {
        user_id: context.userId,
        exercise_id: data.exercise_id,
        seat_notch: data.seat_notch || null,
        pad_notch: data.pad_notch || null,
        custom_setting_notes: data.custom_setting_notes || null,
      },
      { onConflict: "user_id,exercise_id" },
    );
    if (error) throw new Error("Could not save your machine setup. Try again.");
    return { saved: true };
  });

export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        user_id: z.string().optional(),
        // Browser's Date.getTimezoneOffset() (minutes, UTC - local).
        tz_offset: z.number().int().min(-840).max(840).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Start of the current week (Monday 00:00) in the member's local time.
    const offsetMs = (data.tz_offset ?? 0) * 60_000;
    const local = new Date(Date.now() - offsetMs); // local wall clock expressed in UTC fields
    const daysSinceMonday = (local.getUTCDay() + 6) % 7;
    local.setUTCDate(local.getUTCDate() - daysSinceMonday);
    local.setUTCHours(0, 0, 0, 0);
    const sunday = new Date(local.getTime() + offsetMs);

    // A workout counts once it has been finished (completion screen reached).
    const [weekRes, setsRes, userRes] = await Promise.all([
      supabaseAdmin
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .gte("completed_at", sunday.toISOString()),
      supabaseAdmin
        .from("workout_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId),
      supabaseAdmin.from("users").select("weekly_goal_days").eq("id", context.userId).maybeSingle(),
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
  });

// Records a finished workout from this session's logged set IDs, not unrelated logs.
export const completeWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        program_type: z.enum(["premade", "custom"]),
        exercise_ids: z.array(z.string().min(1).max(64)).min(1),
        log_ids: z.array(z.string().uuid()).min(1),
        started_at: z.string().datetime(),
        split_day: z.enum(["A", "B", "C"]).optional(),
        auto_regulated: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (new Set(data.log_ids).size !== data.log_ids.length) throw new Error("Duplicate logged sets");
    // Match strictly on this session's own log IDs (already user-scoped). No timestamp
    // window: device/server clock drift must never drop a set from the session totals.
    const logs = [] as { exercise_id: string; weight_kg: number; reps_completed: number; timestamp: string }[];
    for (let offset = 0; offset < data.log_ids.length; offset += 200) {
      const slice = data.log_ids.slice(offset, offset + 200);
      const { data: batch, error: logErr } = await supabaseAdmin
        .from("workout_logs")
        .select("exercise_id, weight_kg, reps_completed, timestamp")
        .eq("user_id", context.userId)
        .in("id", slice);
      if (logErr || !batch || batch.length !== slice.length) throw new Error("Could not read all logged sets");
      logs.push(...batch);
    }

    // Derive the session start from the sets themselves, clamped by the reported start,
    // so a skewed client clock cannot stamp a session in the future or far past.
    const now = Date.now();
    const reported = Date.parse(data.started_at);
    const earliestLog = logs.reduce((min, l) => Math.min(min, Date.parse(l.timestamp) || now), now);
    const candidate = Number.isFinite(reported) ? Math.min(reported, earliestLog) : earliestLog;
    const floor = now - 12 * 60 * 60 * 1000;
    const startedAt = new Date(Math.min(now, Math.max(floor, candidate)));

    const ids = Array.from(new Set([...data.exercise_ids, ...logs.map((l) => l.exercise_id)]));
    const { data: rows } = await supabaseAdmin.from("exercises").select("id, name").in("id", ids);
    const nameById = new Map((rows ?? []).map((r) => [r.id, r.name]));
    const doneIds = new Set(logs.map((l) => l.exercise_id));
    const names = data.exercise_ids.filter((id) => doneIds.has(id)).map((id) => nameById.get(id) ?? id);
    const volume = logs.reduce((s, l) => s + Number(l.weight_kg) * l.reps_completed, 0);


    if (data.auto_regulated) {
      for (let offset = 0; offset < data.log_ids.length; offset += 200) {
        await supabaseAdmin
          .from("workout_logs")
          .update({ auto_regulated: true })
          .eq("user_id", context.userId)
          .in("id", data.log_ids.slice(offset, offset + 200));
      }
    }
    const { data: row, error } = await supabaseAdmin
      .from("workout_sessions")
      .insert({
        user_id: context.userId,
        program_type: data.program_type,
        exercise_names: names,
        total_sets: logs.length,
        total_volume_kg: volume,
        started_at: startedAt.toISOString(),
        auto_regulated: Boolean(data.auto_regulated),
      })
      .select("id, total_sets, total_volume_kg")
      .single();
    if (error) {
      console.error("completeWorkout insert failed", error.code, error.message);
      throw new Error("Could not save workout");
    }
    // Link every set of this workout directly to its session row.
    for (let offset = 0; offset < data.log_ids.length; offset += 200) {
      const { error: linkErr } = await supabaseAdmin
        .from("workout_logs")
        .update({ session_id: row.id })
        .eq("user_id", context.userId)
        .in("id", data.log_ids.slice(offset, offset + 200));
      if (linkErr) console.error("completeWorkout link failed", linkErr.code, linkErr.message);
    }
    // Rotate the pre-made split forward (A → B → C → A) as soon as it's finished.
    if (data.program_type === "premade") {
      const { data: u } = await supabaseAdmin.from("users").select("next_split_day").eq("id", context.userId).maybeSingle();
      const done = (data.split_day ?? u?.next_split_day ?? "A") as SplitDay;
      const { error: rotErr } = await supabaseAdmin
        .from("users")
        .update({ next_split_day: NEXT_SPLIT[done] ?? "A" })
        .eq("id", context.userId);
      if (rotErr) console.error("split rotation failed", rotErr.code, rotErr.message);
    }
    return { id: row.id, sets: row.total_sets, volume: Number(row.total_volume_kg) };
  });

export const getWorkoutHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("workout_sessions")
      .select("id, program_type, exercise_names, total_sets, total_volume_kg, completed_at")
      .eq("user_id", context.userId)
      .order("completed_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) {
      // Log the real cause server-side; return an empty list so a hiccup never blanks the screen.
      console.error("getWorkoutHistory failed", error.code, error.message);
      return [];
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      completedAt: r.completed_at,
      program: r.program_type as "premade" | "custom",
      sets: r.total_sets,
      volume: Number(r.total_volume_kg),
      exercises: r.exercise_names,
    }));
  });

// Removes one finished session the member picked in History. The weekly ring
// counts rows in workout_sessions, so deleting here deducts it automatically.
export const deleteWorkoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: readErr } = await supabaseAdmin
      .from("workout_sessions")
      .select("id, started_at, completed_at")
      .eq("id", data.session_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error("Could not load that workout");
    if (!session) return { deleted: false as const };

    // Delete exactly the sets linked to this session.
    const { data: linked, error: logErr } = await supabaseAdmin
      .from("workout_logs")
      .delete()
      .eq("user_id", context.userId)
      .eq("session_id", session.id)
      .select("id");
    if (logErr) throw new Error("Could not delete that workout");
    if ((linked ?? []).length === 0) {
      // Legacy session without linkage: only unlinked sets inside its window.
      const { error: legacyErr } = await supabaseAdmin
        .from("workout_logs")
        .delete()
        .eq("user_id", context.userId)
        .is("session_id", null)
        .gte("timestamp", session.started_at)
        .lte("timestamp", session.completed_at);
      if (legacyErr) throw new Error("Could not delete that workout");
    }

    const { error } = await supabaseAdmin
      .from("workout_sessions")
      .delete()
      .eq("id", session.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete that workout");
    return { deleted: true as const };
  });

const EX_FIELDS = "id, name, instructions, setup_cue, position_cue, movement_cue, video_url, alternative_exercise_id";

// Up to 4 alternatives sharing the movement pattern; the curated alternative comes first.
export const getAlternativeOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ exercise_id: z.string().min(1).max(64), exclude: z.array(z.string().max(64)).max(50).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: current } = await context.supabase
      .from("exercises")
      .select("movement_type, alternative_exercise_id")
      .eq("id", data.exercise_id)
      .maybeSingle();
    if (!current) return [];
    const { data: rows } = await context.supabase
      .from("exercises")
      .select(`${EX_FIELDS}, equipment_type, movement_type`)
      .eq("movement_type", current.movement_type)
      .neq("id", data.exercise_id)
      .order("name");
    const skip = new Set(data.exclude ?? []);
    const list = (rows ?? []).filter((r) => !skip.has(r.id));
    list.sort((a, b) => Number(b.id === current.alternative_exercise_id) - Number(a.id === current.alternative_exercise_id));
    return list.slice(0, 4);
  });

// Local calendar dates (YYYY-MM-DD) with at least one logged set, last ~20 weeks.
export const getActivityDays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ tz_offset: z.number().int().min(-840).max(840) }).parse(data))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 20 * 7 * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("workout_logs")
      .select("timestamp")
      .eq("user_id", context.userId)
      .gte("timestamp", since)
      .limit(5000);
    if (error) throw new Error("Could not load activity");
    const days = new Set<string>();
    for (const r of rows ?? []) {
      const local = new Date(new Date(r.timestamp).getTime() - data.tz_offset * 60_000);
      days.add(local.toISOString().slice(0, 10));
    }
    return [...days];
  });

// Every set recorded during one finished session.
export const getSessionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ session_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: session } = await context.supabase
      .from("workout_sessions")
      .select("started_at, completed_at")
      .eq("id", data.session_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!session) return [];
    const cols = "id, exercise_id, set_number, weight_kg, reps_completed, timestamp, exercises(name)";
    let { data: logs, error } = await context.supabase
      .from("workout_logs")
      .select(cols)
      .eq("user_id", context.userId)
      .eq("session_id", data.session_id)
      .order("timestamp");
    if (!error && (logs ?? []).length === 0) {
      // Legacy sessions saved before direct linkage: fall back to unlinked sets in the window.
      ({ data: logs, error } = await context.supabase
        .from("workout_logs")
        .select(cols)
        .eq("user_id", context.userId)
        .is("session_id", null)
        .gte("timestamp", session.started_at)
        .lte("timestamp", session.completed_at)
        .order("timestamp"));
    }
    if (error) throw new Error("Could not load workout details");
    const groups: { exercise_id: string; name: string; sets: { id: string; set_number: number; weight_kg: number; reps: number }[] }[] = [];
    for (const l of logs ?? []) {
      let g = groups.find((x) => x.exercise_id === l.exercise_id);
      if (!g) {
        const ex = l.exercises as { name: string } | { name: string }[] | null;
        const name = Array.isArray(ex) ? ex[0]?.name : ex?.name;
        g = { exercise_id: l.exercise_id, name: name ?? l.exercise_id, sets: [] };
        groups.push(g);
      }
      g.sets.push({ id: l.id, set_number: l.set_number, weight_kg: Number(l.weight_kg), reps: l.reps_completed });
    }
    return groups;
  });

// Best estimated 1RM (Epley) per training day over the last 8 weeks.
export const getExerciseProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ exercise_id: z.string().min(1).max(64), tz_offset: z.number().int().min(-840).max(840) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("workout_logs")
      .select("weight_kg, reps_completed, timestamp")
      .eq("user_id", context.userId)
      .eq("exercise_id", data.exercise_id)
      .gte("timestamp", since)
      .order("timestamp")
      .limit(2000);
    if (error) throw new Error("Could not load progress");
    const byDay = new Map<string, { date: string; e1rm: number; weight: number; reps: number }>();
    for (const r of rows ?? []) {
      const w = Number(r.weight_kg);
      const e1rm = Math.round(w * (1 + r.reps_completed / 30) * 10) / 10;
      const date = new Date(new Date(r.timestamp).getTime() - data.tz_offset * 60_000).toISOString().slice(0, 10);
      const prev = byDay.get(date);
      if (!prev || e1rm > prev.e1rm) byDay.set(date, { date, e1rm, weight: w, reps: r.reps_completed });
    }
    return [...byDay.values()];
  });
