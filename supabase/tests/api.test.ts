// The database functions that replace the old server: each scenario runs as a
// signed-in member through the `authenticated` role, exactly like the app does.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

type SetRow = { id: string; set_number: number; is_personal_record: boolean };
type Ensure = { userId: string; accountMissing: boolean; onboarded: boolean; fullName: string | null; frequency: string | null; equipment: string | null };

let t: TestDb;
const log = (weight: number, key: string, exercise = "goblet-squat", set = 1) =>
  t.rpc<SetRow>(`SELECT public.log_workout_set($1, $2, 10, $3, $4)`, [exercise, weight, set, key]);
const splitDay = async () => {
  await t.asAdmin();
  const [row] = await t.rows<{ next_split_day: string }>(`SELECT next_split_day FROM users WHERE id = $1`, [A]);
  await t.as(A);
  return row?.next_split_day;
};

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(A, "a@example.test", "correct-horse");
  await t.createUser(B, "b@example.test", "other-pass");
});

describe("profile", () => {
  it("refuses signed-out callers", async () => {
    await t.as(null);
    expect(await errorOf(t.rpc(`SELECT public.ensure_user_row()`))).toMatch(/permission denied/);
  });

  it("creates the profile row on first sign-in", async () => {
    await t.as(A);
    const r = await t.rpc<Ensure>(`SELECT public.ensure_user_row()`);
    expect(r).toMatchObject({ userId: A, accountMissing: false, onboarded: false });
  });

  it("saves onboarding answers, trimming the name", async () => {
    await t.rpc(`SELECT public.create_user_profile('  Andrei ', 30, '3-days', 'gain-muscle', 'dumbbells')`);
    const r = await t.rpc<Ensure>(`SELECT public.ensure_user_row()`);
    expect(r).toMatchObject({ onboarded: true, fullName: "Andrei", frequency: "3-days", equipment: "dumbbells" });
  });

  it("rejects invalid onboarding answers", async () => {
    expect(await errorOf(t.rpc(`SELECT public.create_user_profile('X', 30, 'daily', 'gain-muscle', 'dumbbells')`))).toMatch(/frequency/);
    expect(await errorOf(t.rpc(`SELECT public.create_user_profile('X', 5, '3-days', 'gain-muscle', 'dumbbells')`))).not.toBeNull();
    expect(await errorOf(t.rpc(`SELECT public.create_user_profile('X', 30, '3-days', 'gain-muscle', 'kettlebells')`))).not.toBeNull();
  });
});

describe("logging sets", () => {
  const ids: Record<string, string> = {};

  it("does not mark the first ever set as a personal record", async () => {
    const s = await log(50, "k1");
    ids["k1"] = s.id;
    expect(s.is_personal_record).toBe(false);
  });

  it("marks a heavier set as a personal record", async () => {
    const s = await log(60, "k2", "goblet-squat", 2);
    ids["k2"] = s.id;
    expect(s.is_personal_record).toBe(true);
  });

  it("keeps a retried set as one row with the same verdict", async () => {
    const again = await log(60, "k2", "goblet-squat", 2);
    expect(again).toMatchObject({ id: ids["k2"], is_personal_record: true });
  });

  it("re-judges a record when a set is corrected", async () => {
    const s = await log(55, "k3", "goblet-squat", 3);
    ids["k3"] = s.id;
    expect(s.is_personal_record).toBe(false);
    const fixed = await t.rpc<{ is_personal_record: boolean }>(`SELECT public.update_workout_set($1, 70, 8)`, [s.id]);
    expect(fixed.is_personal_record).toBe(true);
  });

  it("rejects impossible values", async () => {
    expect(await errorOf(log(2000, "heavy"))).not.toBeNull();
    expect(await errorOf(t.rpc(`SELECT public.log_workout_set('goblet-squat', 10, 0, 1, 'zero')`))).not.toBeNull();
    expect(await errorOf(log(10, "x", "not-an-exercise"))).not.toBeNull();
  });

  it("never lets another member edit or delete your sets", async () => {
    await t.as(B);
    await t.rpc(`SELECT public.ensure_user_row()`);
    expect(await errorOf(t.rpc(`SELECT public.update_workout_set($1, 1, 1)`, [ids["k1"]]))).toMatch(/no longer exists/);
    await t.rpc(`SELECT public.delete_workout_set($1)`, [ids["k1"]]);
    await t.as(A);
    const mine = await t.rows(`SELECT id FROM workout_logs WHERE id = $1`, [ids["k1"]]);
    expect(mine).toHaveLength(1);
  });
});

describe("finishing a workout", () => {
  let workoutId = "";
  let logIds: string[] = [];
  const started = new Date(Date.now() - 3_600_000).toISOString();

  it("totals only this session's sets", async () => {
    await t.as(A);
    const sets = await t.rows<{ id: string; exercise_id: string }>(`SELECT id, exercise_id FROM workout_logs ORDER BY "timestamp"`);
    const bench = await log(20, "k4", "db-bench");
    logIds = [...sets.map((s) => s.id), bench.id];
    const r = await t.rpc<{ id: string; sets: number; volume: number }>(
      `SELECT public.complete_workout('premade', $1, $2, $3, 'A', false)`,
      [["goblet-squat", "db-bench", "db-row"], logIds, started],
    );
    workoutId = r.id;
    expect(r.sets).toBe(4);
    expect(Number(r.volume)).toBe(50 * 10 + 60 * 10 + 70 * 8 + 20 * 10);
  });

  it("lists only the exercises actually done, in plan order", async () => {
    const [s] = await t.rows<{ exercise_names: string[] }>(`SELECT exercise_names FROM workout_sessions WHERE id = $1`, [workoutId]);
    expect(s?.exercise_names).toEqual(["Goblet Squat", "Dumbbell Bench Press"]);
  });

  it("rotates the pre-made plan A -> B", async () => {
    expect(await splitDay()).toBe("B");
  });

  it("returns the same workout on a repeated finish and does not rotate twice", async () => {
    const again = await t.rpc<{ id: string }>(`SELECT public.complete_workout('premade', $1, $2, $3, 'A', false)`, [["goblet-squat"], logIds, started]);
    expect(again.id).toBe(workoutId);
    expect(await splitDay()).toBe("B");
  });

  it("does not rotate the plan for a custom workout", async () => {
    const s = await log(10, "k5", "db-bench");
    await t.rpc(`SELECT public.complete_workout('custom', $1, $2, now())`, [["db-bench"], [s.id]]);
    expect(await splitDay()).toBe("B");
  });

  it("does not rotate when an old screen finishes a day that is no longer due", async () => {
    const s = await log(10, "k6", "db-bench");
    await t.rpc(`SELECT public.complete_workout('premade', $1, $2, now(), 'A')`, [["db-bench"], [s.id]]);
    expect(await splitDay()).toBe("B");
  });

  it("rejects duplicate set ids", async () => {
    expect(await errorOf(t.rpc(`SELECT public.complete_workout('premade', $1, $2, now())`, [["goblet-squat"], [logIds[0], logIds[0]]]))).toMatch(/Duplicate/);
  });

  it("clamps a device clock set in the future", async () => {
    const s = await log(10, "k7", "db-bench");
    const r = await t.rpc<{ id: string }>(`SELECT public.complete_workout('custom', $1, $2, $3)`, [["db-bench"], [s.id], "2100-01-01T00:00:00Z"]);
    const [row] = await t.rows<{ ok: boolean }>(`SELECT started_at <= now() AS ok FROM workout_sessions WHERE id = $1`, [r.id]);
    expect(row?.ok).toBe(true);
  });

  it("refuses to save another member's sets", async () => {
    await t.as(B);
    expect(await errorOf(t.rpc(`SELECT public.complete_workout('custom', $1, $2, now())`, [["db-bench"], [logIds[0]]]))).toMatch(/Could not read/);
    await t.as(A);
  });

  it("deletes a workout together with its sets, but only your own", async () => {
    await t.as(B);
    expect(await t.rpc<{ deleted: boolean }>(`SELECT public.delete_workout_session($1)`, [workoutId])).toEqual({ deleted: false });
    await t.as(A);
    expect(await t.rpc<{ deleted: boolean }>(`SELECT public.delete_workout_session($1)`, [workoutId])).toEqual({ deleted: true });
    expect(await t.rows(`SELECT id FROM workout_logs WHERE session_id = $1`, [workoutId])).toHaveLength(0);
  });
});

describe("Pro features", () => {
  it("are locked for basic members", async () => {
    await t.as(A);
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench"]]))).toMatch(/PRO_REQUIRED/);
    expect(await errorOf(t.rpc(`SELECT public.get_alternative_options('goblet-squat')`))).toMatch(/PRO_REQUIRED/);
    expect(await errorOf(t.rpc(`SELECT public.get_exercise_progress('goblet-squat', 0)`))).toMatch(/PRO_REQUIRED/);
  });

  it("unlock once the account is Pro", async () => {
    await t.asAdmin();
    await t.db.query(`UPDATE users SET subscription_tier = 'pro' WHERE id = $1`, [A]);
    await t.as(A);
    await t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench", "goblet-squat"]]);
    const [u] = await t.rows<{ is_custom: boolean; custom_exercise_ids: string[] }>(`SELECT is_custom, custom_exercise_ids FROM users WHERE id = $1`, [A]);
    expect(u).toEqual({ is_custom: true, custom_exercise_ids: ["db-bench", "goblet-squat"] });
  });

  it("validate the custom routine", async () => {
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench", "db-bench"]]))).toMatch(/different/);
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [["nope"]]))).toMatch(/Unknown/);
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [[]]))).toMatch(/at least one/);
  });

  it("offer up to 4 swaps of the same movement, curated one first", async () => {
    const alts = await t.rpc<{ id: string; movement_type: string }[]>(`SELECT public.get_alternative_options('db-bench')`);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(4);
    expect(alts[0]?.id).toBe("chest-press");
    expect(new Set(alts.map((a) => a.movement_type)).size).toBe(1);
    const filtered = await t.rpc<{ id: string }[]>(`SELECT public.get_alternative_options('db-bench', $1)`, [["chest-press"]]);
    expect(filtered.map((a) => a.id)).not.toContain("chest-press");
  });

  it("chart the best estimated 1RM per day", async () => {
    // Earlier sets were deleted with their workout; log a fresh day of training.
    await log(80, "p1", "goblet-squat", 1);
    await log(60, "p2", "goblet-squat", 2);
    const days = await t.rpc<{ e1rm: number }[]>(`SELECT public.get_exercise_progress('goblet-squat', 0)`);
    expect(days).toHaveLength(1);
    expect(Number(days[0]?.e1rm)).toBe(Math.round(80 * (1 + 10 / 30) * 10) / 10);
  });
});

describe("machine settings", () => {
  it("are trimmed, upserted and one per exercise", async () => {
    await t.as(A);
    await t.rpc(`SELECT public.save_machine_setting('chest-press', ' 4 ', '', 'left handle sticks')`);
    await t.rpc(`SELECT public.save_machine_setting('chest-press', '5', 'B', '')`);
    const rows = await t.rows(`SELECT seat_notch, pad_notch, custom_setting_notes FROM user_machine_settings`);
    expect(rows).toEqual([{ seat_notch: "5", pad_notch: "B", custom_setting_notes: null }]);
  });
});

describe("account deletion", () => {
  it("keeps the account when the password is wrong", async () => {
    await t.as(A);
    expect(await t.rpc(`SELECT public.delete_account('wrong')`)).toEqual({ deleted: false, reason: "invalid_password" });
  });

  it("removes the login and every row of data with the right password", async () => {
    expect(await t.rpc(`SELECT public.delete_account('correct-horse')`)).toEqual({ deleted: true, reason: null });
    await t.asAdmin();
    for (const [table, col] of [["auth.users", "id"], ["users", "id"], ["workout_logs", "user_id"], ["workout_sessions", "user_id"], ["user_machine_settings", "user_id"]]) {
      expect(await t.rows(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [A])).toHaveLength(0);
    }
  });

  it("tells a device still holding the old session that the account is gone", async () => {
    await t.as(A);
    expect(await t.rpc<Ensure>(`SELECT public.ensure_user_row()`)).toMatchObject({ accountMissing: true });
  });

  it("leaves other members untouched", async () => {
    await t.asAdmin();
    expect(await t.rows(`SELECT 1 FROM users WHERE id = $1`, [B])).toHaveLength(1);
  });
});
