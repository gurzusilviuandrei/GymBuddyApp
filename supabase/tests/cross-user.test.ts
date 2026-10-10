// One member (B, the attacker) tries every route the app's API offers to read or change
// another member's (A, the victim's) data: the tables directly, every app function, and
// the login table. Each attempt must fail, and A's data must be exactly as before.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // victim
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // attacker

let t: TestDb;
let aFinishedSet: string;
let aOpenSet: string;
let aSession: string;
let bSet: string;
let snapshotBefore: string;

/** Everything of A's, as the database owner sees it. */
async function snapshotOfA(): Promise<string> {
  await t.asAdmin();
  const parts = await Promise.all([
    t.rows(`SELECT * FROM users WHERE id = $1`, [A]),
    t.rows(`SELECT id, exercise_id, weight_kg, reps_completed, set_number, client_key, session_id FROM workout_logs WHERE user_id = $1 ORDER BY id`, [A]),
    t.rows(`SELECT * FROM workout_sessions WHERE user_id = $1 ORDER BY id`, [A]),
    t.rows(`SELECT * FROM user_machine_settings WHERE user_id = $1 ORDER BY id`, [A]),
    t.rows(`SELECT id, email, encrypted_password FROM auth.users WHERE id = $1`, [A]),
  ]);
  return JSON.stringify(parts);
}

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(A, "victim@example.test", "victim-password");
  await t.createUser(B, "attacker@example.test", "attacker-password");
  for (const uid of [A, B]) {
    await t.as(uid);
    await t.rpc(`SELECT public.ensure_user_row()`);
    await t.rpc(`SELECT public.create_user_profile('Member', 30, '3-days', 'gain-muscle', 'full-gym')`);
  }
  // Both are Pro, so the attacker can reach the Pro-only functions too.
  await t.asAdmin();
  await t.db.query(`UPDATE users SET subscription_tier = 'pro' WHERE id IN ($1, $2)`, [A, B]);

  await t.as(A);
  const finished = await t.rpc<{ id: string }>(`SELECT public.log_workout_set('goblet-squat', 40, 10, 1, 'a-finished')`);
  aFinishedSet = finished.id;
  const session = await t.rpc<{ id: string }>(
    `SELECT public.complete_workout('premade', ARRAY['goblet-squat'], ARRAY[$1]::uuid[], now() - interval '1 hour', 'A')`,
    [aFinishedSet],
  );
  aSession = session.id;
  const open = await t.rpc<{ id: string }>(`SELECT public.log_workout_set('goblet-squat', 50, 8, 1, 'a-open')`);
  aOpenSet = open.id;
  await t.rpc(`SELECT public.save_machine_setting('chest-press', '4', '2', 'victim notes')`);
  await t.rpc(`SELECT public.save_custom_routine(ARRAY['goblet-squat', 'chest-press'])`);

  await t.as(B);
  const own = await t.rpc<{ id: string }>(`SELECT public.log_workout_set('goblet-squat', 20, 10, 1, 'b-own')`);
  bSet = own.id;

  snapshotBefore = await snapshotOfA();
});

describe("a member reading another member's data directly", () => {
  it("sees none of it in any table, even when asking for it by id", async () => {
    await t.as(B);
    expect(await t.rows(`SELECT * FROM users WHERE id = $1`, [A])).toHaveLength(0);
    expect(await t.rows(`SELECT * FROM workout_logs WHERE user_id = $1`, [A])).toHaveLength(0);
    expect(await t.rows(`SELECT * FROM workout_logs WHERE id = $1`, [aOpenSet])).toHaveLength(0);
    expect(await t.rows(`SELECT * FROM workout_sessions WHERE id = $1`, [aSession])).toHaveLength(0);
    expect(await t.rows(`SELECT * FROM user_machine_settings WHERE user_id = $1`, [A])).toHaveLength(0);
  });

  it("cannot read the logins or the beta testers list", async () => {
    await t.as(B);
    expect(await errorOf(t.rows(`SELECT email FROM auth.users`))).toMatch(/permission denied/);
    // The testers list exists on the beta branch only; elsewhere the table is simply missing.
    expect(await errorOf(t.rows(`SELECT email FROM beta_testers`))).toMatch(/permission denied|does not exist/);
  });
});

describe("a member changing another member's data directly", () => {
  it("cannot insert rows in the other member's name", async () => {
    await t.as(B);
    for (const sql of [
      `INSERT INTO workout_logs (user_id, exercise_id, weight_kg, reps_completed, set_number) VALUES ('${A}', 'goblet-squat', 999, 10, 1)`,
      `INSERT INTO workout_sessions (user_id, program_type, total_sets) VALUES ('${A}', 'premade', 99)`,
      `INSERT INTO user_machine_settings (user_id, exercise_id, seat_notch) VALUES ('${A}', 'goblet-squat', '9')`,
    ]) {
      expect(await errorOf(t.db.query(sql)), sql).not.toBeNull();
    }
  });

  it("cannot update or delete the other member's rows", async () => {
    await t.as(B);
    for (const sql of [
      `UPDATE workout_logs SET weight_kg = 999 WHERE user_id = '${A}'`,
      `UPDATE workout_sessions SET total_sets = 999 WHERE user_id = '${A}'`,
      `UPDATE user_machine_settings SET seat_notch = '9' WHERE user_id = '${A}'`,
      `UPDATE users SET subscription_tier = 'basic' WHERE id = '${A}'`,
      `DELETE FROM workout_logs WHERE user_id = '${A}'`,
      `DELETE FROM workout_sessions WHERE user_id = '${A}'`,
      `DELETE FROM user_machine_settings WHERE user_id = '${A}'`,
      `DELETE FROM users WHERE id = '${A}'`,
    ]) {
      // Either refused outright or allowed to touch nothing; the final snapshot proves which.
      await errorOf(t.db.query(sql));
    }
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });
});

describe("a member using the app's functions against another member", () => {
  it("cannot edit another member's set", async () => {
    await t.as(B);
    expect(await errorOf(t.rpc(`SELECT public.update_workout_set($1, 999, 99)`, [aOpenSet]))).toMatch(/no longer exists/);
    expect(await errorOf(t.rpc(`SELECT public.update_workout_set($1, 999, 99)`, [aFinishedSet]))).toMatch(/no longer exists/);
  });

  it("cannot delete another member's set or workout", async () => {
    await t.as(B);
    await t.rpc(`SELECT public.delete_workout_set($1)`, [aOpenSet]);
    const result = await t.rpc<{ deleted: boolean }>(`SELECT public.delete_workout_session($1)`, [aSession]);
    expect(result.deleted).toBe(false);
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });

  it("cannot finish a workout with another member's sets, alone or mixed with their own", async () => {
    await t.as(B);
    expect(
      await errorOf(t.rpc(`SELECT public.complete_workout('premade', ARRAY['goblet-squat'], ARRAY[$1]::uuid[], now(), 'A')`, [aOpenSet])),
    ).toMatch(/Could not read all logged sets/);
    expect(
      await errorOf(t.rpc(`SELECT public.complete_workout('premade', ARRAY['goblet-squat'], ARRAY[$1, $2]::uuid[], now(), 'A')`, [bSet, aOpenSet])),
    ).toMatch(/Could not read all logged sets/);
    // Re-finishing a workout whose id list includes the victim's finished set must not reach it either.
    expect(
      await errorOf(t.rpc(`SELECT public.complete_workout('premade', ARRAY['goblet-squat'], ARRAY[$1]::uuid[], now(), 'A')`, [aFinishedSet])),
    ).toMatch(/Could not read all logged sets/);
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });

  it("reusing another member's set key only ever writes the attacker's own set", async () => {
    await t.as(B);
    await t.rpc(`SELECT public.log_workout_set('goblet-squat', 999, 99, 1, 'a-open')`);
    await t.asAdmin();
    const [owner] = await t.rows<{ user_id: string }>(`SELECT user_id FROM workout_logs WHERE client_key = 'a-open' AND weight_kg = 999`);
    expect(owner?.user_id).toBe(B);
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });

  it("sees only their own numbers in the strength graph", async () => {
    await t.as(B);
    const points = await t.rpc<Array<{ weight: number }>>(`SELECT public.get_exercise_progress('goblet-squat', 0)`);
    expect(points.every((p) => Number(p.weight) !== 40 && Number(p.weight) !== 50)).toBe(true);
  });

  it("cannot learn another member's Pro status through the old is_pro helper", async () => {
    await t.as(B);
    await t.asAdmin();
    await t.db.query(`UPDATE users SET subscription_environment = 'live' WHERE id = $1`, [A]);
    snapshotBefore = await snapshotOfA();
    await t.as(B);
    expect(await t.rpc<boolean>(`SELECT public.is_pro($1, 'live')`, [A])).toBe(false);
  });

  it("gets only their own profile from ensure_user_row", async () => {
    await t.as(B);
    const me = await t.rpc<{ userId: string }>(`SELECT public.ensure_user_row()`);
    expect(me.userId).toBe(B);
  });

  it("cannot delete another member's account, even knowing that member's password", async () => {
    await t.as(B);
    const tryVictimPassword = await t.rpc<{ deleted: boolean }>(`SELECT public.delete_account('victim-password')`);
    expect(tryVictimPassword.deleted).toBe(false);
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });

  it("deleting their own account removes only their own data", async () => {
    await t.as(B);
    const own = await t.rpc<{ deleted: boolean }>(`SELECT public.delete_account('attacker-password')`);
    expect(own.deleted).toBe(true);
    await t.asAdmin();
    expect(await t.rows(`SELECT 1 FROM workout_logs WHERE user_id = $1`, [B])).toHaveLength(0);
    expect(await t.rows(`SELECT 1 FROM auth.users WHERE id = $1`, [B])).toHaveLength(0);
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });
});

describe("a signed-out visitor", () => {
  it("can read nothing of any member", async () => {
    await t.as(null);
    for (const table of ["users", "workout_logs", "workout_sessions", "user_machine_settings"]) {
      const rows = await t.rows(`SELECT * FROM ${table}`).catch(() => []);
      expect(rows, table).toHaveLength(0);
    }
  });

  it("cannot call any function that touches member data", async () => {
    await t.as(null);
    for (const sql of [
      `SELECT public.update_workout_set('${aOpenSet}', 1, 1)`,
      `SELECT public.delete_workout_set('${aOpenSet}')`,
      `SELECT public.delete_workout_session('${aSession}')`,
      `SELECT public.delete_account('victim-password')`,
      `SELECT public.is_pro('${A}', 'live')`,
    ]) {
      expect(await errorOf(t.rpc(sql)), sql).toMatch(/permission denied/);
    }
    expect(await snapshotOfA()).toBe(snapshotBefore);
  });
});

// Kept on its own database: if TRUNCATE gets through it empties every table, which would
// make every other test here meaningless.
describe("emptying a table with TRUNCATE (it ignores row-level security)", () => {
  it("is refused for members and signed-out visitors", async () => {
    const own = await createTestDb();
    await own.createUser(A, "victim@example.test", "victim-password");
    await own.as(A);
    await own.rpc(`SELECT public.ensure_user_row()`);
    await own.rpc(`SELECT public.log_workout_set('goblet-squat', 40, 10, 1, 'a-1')`);
    const results: string[] = [];
    for (const uid of [B, null]) {
      for (const table of ["workout_logs", "workout_sessions", "user_machine_settings", "users", "exercises", "workout_programs"]) {
        await own.as(uid);
        const error = await errorOf(own.db.query(`TRUNCATE ${table} CASCADE`));
        results.push(`${uid ? "member" : "visitor"} ${table}: ${error ? "refused" : "ALLOWED"}`);
      }
    }
    expect(results.filter((r) => r.endsWith("ALLOWED"))).toEqual([]);
  });
});

describe("table privileges (security review M1)", () => {
  const TABLES = ["users", "exercises", "workout_programs", "workout_logs", "workout_sessions", "user_machine_settings"];

  it("leave signed-out visitors nothing and members only SELECT", async () => {
    await t.asAdmin();
    const grants = await t.rows<{ table_name: string; grantee: string; privilege_type: string }>(
      `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = ANY ($1) AND grantee IN ('anon', 'authenticated')
       ORDER BY 1, 2, 3`,
      [TABLES],
    );
    expect(grants.filter((g) => g.grantee === "anon")).toEqual([]);
    expect(grants.filter((g) => g.privilege_type !== "SELECT")).toEqual([]);
    expect(grants.map((g) => g.table_name).sort()).toEqual([...TABLES].sort());
  });

  it("do not hand a newly created table to visitors or members", async () => {
    await t.asAdmin();
    await t.db.exec(`CREATE TABLE public.zz_new_table (id int)`);
    const grants = await t.rows(
      `SELECT grantee, privilege_type FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'zz_new_table' AND grantee IN ('anon', 'authenticated')`,
    );
    await t.db.exec(`DROP TABLE public.zz_new_table`);
    expect(grants).toEqual([]);
  });
});
