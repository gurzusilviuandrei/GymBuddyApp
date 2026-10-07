// Editing the training profile after onboarding (update_training_profile).
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

type Row = { full_name: string; age: number; weekly_goal_days: number; primary_goal: string; equipment_type: string; next_split_day: string; is_custom: boolean; custom_exercise_ids: string[]; subscription_tier: string };
type Result = { equipment: string; restarted: boolean };

let t: TestDb;

const rowOf = async (id: string): Promise<Row> => {
  await t.asAdmin();
  const [row] = await t.rows<Row>(
    `SELECT full_name, age, weekly_goal_days, primary_goal, equipment_type, next_split_day, is_custom, custom_exercise_ids, subscription_tier FROM users WHERE id = $1`,
    [id],
  );
  await t.as(C);
  return row!;
};
const update = (name: string, age: number, frequency: string, goal: string, equipment: string) =>
  t.rpc<Result>(`SELECT public.update_training_profile($1, $2, $3, $4, $5)`, [name, age, frequency, goal, equipment]);

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(C, "c@example.test", "pass-c-1234");
  await t.createUser(D, "d@example.test", "pass-d-1234");
  for (const id of [C, D]) {
    await t.as(id);
    await t.rpc(`SELECT public.ensure_user_row()`);
  }
  await t.as(C);
});

describe("update_training_profile", () => {
  it("refuses signed-out callers", async () => {
    await t.as(null);
    expect(await errorOf(update("X", 30, "3-days", "gain-muscle", "dumbbells"))).toMatch(/permission denied/);
    await t.as(C);
  });

  it("refuses a member who has not finished onboarding", async () => {
    expect(await errorOf(update("Ana", 30, "3-days", "gain-muscle", "dumbbells"))).toMatch(/Finish setting up/);
  });

  it("changes every field and trims the name", async () => {
    await t.rpc(`SELECT public.create_user_profile('Ana', 30, '3-days', 'gain-muscle', 'dumbbells')`);
    const r = await update("  Ana Maria  ", 31, "4-plus", "lose-weight", "dumbbells");
    expect(r).toEqual({ equipment: "dumbbells", restarted: false });
    expect(await rowOf(C)).toMatchObject({ full_name: "Ana Maria", age: 31, weekly_goal_days: 4, primary_goal: "lose-weight", equipment_type: "dumbbells" });
  });

  it("shows up in what the app reads on start-up", async () => {
    expect(await t.rpc(`SELECT public.ensure_user_row()`)).toMatchObject({ fullName: "Ana Maria", frequency: "4-plus", goal: "lose-weight", equipment: "dumbbells" });
  });

  it("keeps the A-B-C rotation where it is when the equipment stays the same", async () => {
    await t.asAdmin();
    await t.db.query(`UPDATE users SET next_split_day = 'C' WHERE id = $1`, [C]);
    await t.as(C);
    const r = await update("Ana Maria", 31, "2-days", "sports-performance", "dumbbells");
    expect(r.restarted).toBe(false);
    expect((await rowOf(C)).next_split_day).toBe("C");
  });

  it("restarts the rotation at Day A when the equipment changes, and leaves the custom routine and Pro alone", async () => {
    await t.asAdmin();
    await t.db.query(`UPDATE users SET subscription_tier = 'pro', is_custom = true, custom_exercise_ids = ARRAY['db-bench','goblet-squat'] WHERE id = $1`, [C]);
    await t.as(C);
    const r = await update("Ana Maria", 31, "3-days", "gain-muscle", "barbell");
    expect(r).toEqual({ equipment: "barbell", restarted: true });
    expect(await rowOf(C)).toMatchObject({ equipment_type: "barbell", next_split_day: "A", is_custom: true, custom_exercise_ids: ["db-bench", "goblet-squat"], subscription_tier: "pro" });
  });

  it("changes the swap suggestions to match the new equipment", async () => {
    const alts = await t.rpc<{ id: string; equipment_type: string }[]>(`SELECT public.get_alternative_options('db-bench')`);
    expect(alts.map((a) => a.id)).toEqual(["bench-press"]);
    await update("Ana Maria", 31, "3-days", "gain-muscle", "full-gym");
    const all = await t.rpc<{ id: string }[]>(`SELECT public.get_alternative_options('db-bench')`);
    expect(all[0]?.id).toBe("chest-press");
  });

  it("rejects values the database will not hold, and changes nothing", async () => {
    const before = await rowOf(C);
    expect(await errorOf(update("Ana", 30, "daily", "gain-muscle", "dumbbells"))).toMatch(/frequency/);
    expect(await errorOf(update("Ana", 5, "3-days", "gain-muscle", "dumbbells"))).not.toBeNull();
    expect(await errorOf(update("Ana", 101, "3-days", "gain-muscle", "dumbbells"))).not.toBeNull();
    expect(await errorOf(update("Ana", 30, "3-days", "get-huge", "dumbbells"))).not.toBeNull();
    expect(await errorOf(update("Ana", 30, "3-days", "gain-muscle", "kettlebells"))).not.toBeNull();
    expect(await errorOf(update("   ", 30, "3-days", "gain-muscle", "dumbbells"))).not.toBeNull();
    expect(await errorOf(update("x".repeat(61), 30, "3-days", "gain-muscle", "dumbbells"))).not.toBeNull();
    expect(await rowOf(C)).toEqual(before);
  });

  it("only ever edits the signed-in member's own row", async () => {
    const dBefore = await rowOf(D);
    await update("Changed By C", 40, "2-days", "lose-weight", "barbell");
    expect(await rowOf(D)).toEqual(dBefore);
    expect((await rowOf(C)).full_name).toBe("Changed By C");
  });
});
