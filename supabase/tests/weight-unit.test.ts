// The kg / lb preference: stored per member, optional everywhere so older app builds keep working.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const E = "99999999-9999-4999-8999-999999999999";
const F = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let t: TestDb;
const unitOf = async (id: string) => {
  await t.asAdmin();
  const [row] = await t.rows<{ weight_unit: string }>(`SELECT weight_unit FROM users WHERE id = $1`, [id]);
  await t.as(id);
  return row?.weight_unit;
};

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(E, "e@example.test", "pass-e-1234");
  await t.createUser(F, "f@example.test", "pass-f-1234");
  for (const id of [E, F]) {
    await t.as(id);
    await t.rpc(`SELECT public.ensure_user_row()`);
  }
});

describe("weight unit at onboarding", () => {
  it("is kilograms when the app doesn't say (an older app build)", async () => {
    await t.as(E);
    await t.rpc(`SELECT public.create_user_profile('Eve', 30, '3-days', 'gain-muscle', 'dumbbells')`);
    expect(await unitOf(E)).toBe("kg");
  });

  it("is stored when the app sends it", async () => {
    await t.as(F);
    await t.rpc(`SELECT public.create_user_profile('Finn', 30, '3-days', 'gain-muscle', 'dumbbells', 'lb')`);
    expect(await unitOf(F)).toBe("lb");
  });

  it("refuses a unit that isn't kg or lb", async () => {
    await t.as(E);
    expect(await errorOf(t.rpc(`SELECT public.create_user_profile('Eve', 30, '3-days', 'gain-muscle', 'dumbbells', 'stone')`))).toMatch(/weight unit/);
    expect(await unitOf(E)).toBe("kg");
  });

  it("is not reset to kilograms when onboarding is repeated by an app that doesn't send a unit", async () => {
    await t.as(F);
    await t.rpc(`SELECT public.create_user_profile('Finn', 31, '3-days', 'gain-muscle', 'dumbbells')`);
    expect(await unitOf(F)).toBe("lb");
  });
});

describe("weight unit when editing the profile", () => {
  const edit = (id: string, unit?: string) =>
    t.as(id).then(() =>
      unit === undefined
        ? t.rpc<{ weightUnit: string }>(`SELECT public.update_training_profile('Name', 30, '3-days', 'gain-muscle', 'dumbbells')`)
        : t.rpc<{ weightUnit: string }>(`SELECT public.update_training_profile('Name', 30, '3-days', 'gain-muscle', 'dumbbells', $1)`, [unit]),
    );

  it("changes the unit and says what it is now", async () => {
    expect((await edit(E, "lb")).weightUnit).toBe("lb");
    expect(await unitOf(E)).toBe("lb");
    expect((await edit(E, "kg")).weightUnit).toBe("kg");
    expect(await unitOf(E)).toBe("kg");
  });

  it("keeps the member's choice when the app sends no unit (older build)", async () => {
    await edit(E, "lb");
    const r = await edit(E);
    expect(r.weightUnit).toBe("lb");
    expect(await unitOf(E)).toBe("lb");
  });

  it("refuses an unknown unit and changes nothing", async () => {
    await t.as(E);
    expect(await errorOf(t.rpc(`SELECT public.update_training_profile('Other Name', 30, '3-days', 'gain-muscle', 'dumbbells', 'stone')`))).toMatch(/weight unit/);
    expect(await unitOf(E)).toBe("lb");
    await t.asAdmin();
    const [row] = await t.rows<{ full_name: string }>(`SELECT full_name FROM users WHERE id = $1`, [E]);
    expect(row?.full_name).toBe("Name");
    await t.as(E);
  });

  it("only changes the signed-in member's own unit", async () => {
    await edit(E, "kg");
    expect(await unitOf(F)).toBe("lb");
  });
});

describe("the unit column", () => {
  it("can be read by its owner but never written directly", async () => {
    await t.as(E);
    expect(await t.rows(`SELECT weight_unit FROM users`)).toHaveLength(1);
    expect(await errorOf(t.db.query(`UPDATE users SET weight_unit = 'lb'`))).toMatch(/permission denied/);
  });

  it("never touches how weights are stored: sets stay in kilograms", async () => {
    await t.as(F);
    const set = await t.rpc<{ id: string }>(`SELECT public.log_workout_set('goblet-squat', 61.23, 10, 1, 'lb-set')`);
    await t.asAdmin();
    const [row] = await t.rows<{ weight_kg: string }>(`SELECT weight_kg FROM workout_logs WHERE id = $1`, [set.id]);
    expect(Number(row?.weight_kg)).toBe(61.23);
    await t.as(F);
  });
});
