// Row-level security and grants: what the app's public key and a member's login can
// do directly against the tables, bypassing the app entirely.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const A = "33333333-3333-4333-8333-333333333333";
const B = "44444444-4444-4444-8444-444444444444";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(A, "a@example.test", "pass-a");
  await t.createUser(B, "b@example.test", "pass-b");
  for (const uid of [A, B]) {
    await t.as(uid);
    await t.rpc(`SELECT public.ensure_user_row()`);
    await t.rpc(`SELECT public.log_workout_set('goblet-squat', 40, 10, 1, $1)`, [`set-${uid}`]);
    await t.rpc(`SELECT public.save_machine_setting('chest-press', '3', '', '')`);
  }
});

describe("signed-out visitors", () => {
  it("cannot read the exercise library or plans", async () => {
    await t.as(null);
    expect(await errorOf(t.rows(`SELECT * FROM exercises`))).toMatch(/permission denied/);
    expect(await errorOf(t.rows(`SELECT * FROM workout_programs`))).toMatch(/permission denied/);
  });

  it("see no member data", async () => {
    await t.as(null);
    for (const table of ["users", "workout_logs", "workout_sessions", "user_machine_settings"]) {
      expect(await t.rows(`SELECT * FROM ${table}`)).toHaveLength(0);
    }
  });

  it("cannot call any app function", async () => {
    await t.as(null);
    const fns = await t.rows<{ name: string }>(`
      SELECT p.oid::regprocedure::text AS name FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef`);
    expect(fns.length).toBeGreaterThan(10);
    for (const { name } of fns) {
      const [row] = await t.rows<{ ok: boolean }>(`SELECT has_function_privilege('anon', $1, 'EXECUTE') AS ok`, [name]);
      expect(row?.ok, name).toBe(false);
    }
  });
});

describe("signed-in members", () => {
  it("read only their own rows", async () => {
    await t.as(A);
    for (const [table, col] of [["users", "id"], ["workout_logs", "user_id"], ["user_machine_settings", "user_id"]] as const) {
      const rows = await t.rows<Record<string, string>>(`SELECT ${col} AS owner FROM ${table}`);
      expect(rows.length, table).toBeGreaterThan(0);
      expect(rows.every((r) => r["owner"] === A), table).toBe(true);
    }
  });

  it("can read the exercise library and plans", async () => {
    await t.as(A);
    expect((await t.rows(`SELECT id FROM exercises`)).length).toBeGreaterThan(0);
    expect((await t.rows(`SELECT id FROM workout_programs`)).length).toBeGreaterThan(0);
  });

  it("cannot make themselves Pro", async () => {
    await t.as(A);
    await errorOf(t.db.query(`UPDATE users SET subscription_tier = 'pro' WHERE id = $1`, [A]));
    await t.asAdmin();
    const [u] = await t.rows<{ subscription_tier: string }>(`SELECT subscription_tier FROM users WHERE id = $1`, [A]);
    expect(u?.subscription_tier).toBe("basic");
  });

  it("hold no UPDATE permission on profiles at all, so a later policy slip could not open it", async () => {
    await t.as(A);
    for (const statement of [
      `UPDATE users SET subscription_tier = 'pro'`,
      `UPDATE users SET full_name = 'x'`,
      `UPDATE users SET next_split_day = 'C'`,
      `UPDATE users SET custom_exercise_ids = ARRAY['goblet-squat']`,
    ]) {
      expect(await errorOf(t.db.query(statement)), statement).toMatch(/permission denied for table users/);
    }
    await t.asAdmin();
    const [grants] = await t.rows<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'`,
    );
    expect(Number(grants?.n)).toBe(0);
  });

  it("can still read their own profile after the revoke", async () => {
    await t.as(A);
    expect(await t.rows(`SELECT id FROM users`)).toHaveLength(1);
  });

  it("cannot write workout data directly, only through the app functions", async () => {
    await t.as(A);
    await errorOf(t.db.query(`INSERT INTO workout_logs (user_id, exercise_id, weight_kg, reps_completed, set_number) VALUES ($1, 'goblet-squat', 999, 10, 1)`, [A]));
    await errorOf(t.db.query(`INSERT INTO workout_sessions (user_id, program_type, total_sets) VALUES ($1, 'premade', 99)`, [A]));
    await errorOf(t.db.query(`UPDATE workout_logs SET weight_kg = 999`));
    await errorOf(t.db.query(`DELETE FROM workout_logs`));
    await t.asAdmin();
    const [r] = await t.rows<{ heavy: number; sessions: number; logs: number }>(`
      SELECT (SELECT count(*)::int FROM workout_logs WHERE weight_kg = 999) AS heavy,
             (SELECT count(*)::int FROM workout_sessions) AS sessions,
             (SELECT count(*)::int FROM workout_logs) AS logs`);
    expect(r).toEqual({ heavy: 0, sessions: 0, logs: 2 });
  });

  it("cannot change the exercise library or plans", async () => {
    await t.as(A);
    await errorOf(t.db.query(`UPDATE exercises SET name = 'hacked'`));
    await errorOf(t.db.query(`DELETE FROM workout_programs`));
    await t.asAdmin();
    expect(await t.rows(`SELECT 1 FROM exercises WHERE name = 'hacked'`)).toHaveLength(0);
    expect((await t.rows(`SELECT 1 FROM workout_programs`)).length).toBe(9);
  });

  it("cannot read or touch another member's login", async () => {
    await t.as(A);
    expect(await errorOf(t.rows(`SELECT * FROM auth.users`))).toMatch(/permission denied/);
  });
});
