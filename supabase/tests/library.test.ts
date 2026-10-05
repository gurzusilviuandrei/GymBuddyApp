// The exercise library and pre-made plans the app ships with.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, migrationFiles, readMigration, type TestDb } from "./db";

type Exercise = { id: string; name: string; setup_cue: string | null; position_cue: string | null; movement_cue: string | null; alternative_exercise_id: string | null; movement_type: string };
type Program = { equipment_type: string; day_number: number; exercise_ids_list: string[] };

let t: TestDb;
let exercises: Exercise[];
let programs: Program[];

beforeAll(async () => {
  t = await createTestDb();
  exercises = await t.rows<Exercise>(`SELECT * FROM exercises`);
  programs = await t.rows<Program>(`SELECT * FROM workout_programs ORDER BY equipment_type, day_number`);
});

describe("exercise library", () => {
  it("has all 34 exercises", () => {
    expect(exercises).toHaveLength(34);
  });

  it("gives every exercise all three form cues", () => {
    const missing = exercises.filter((e) => !e.setup_cue || !e.position_cue || !e.movement_cue).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it("only points swaps at real exercises", () => {
    const ids = new Set(exercises.map((e) => e.id));
    const broken = exercises.filter((e) => e.alternative_exercise_id && !ids.has(e.alternative_exercise_id)).map((e) => e.id);
    expect(broken).toEqual([]);
  });

  it("has demo images in the app for every exercise", () => {
    const media = readFileSync(fileURLToPath(new URL("../../src/lib/exercise-media.ts", import.meta.url)), "utf8");
    const missing = exercises.filter((e) => !media.includes(`"${e.id}"`) && !media.includes(`'${e.id}'`)).map((e) => e.id);
    expect(missing).toEqual([]);
  });
});

describe("pre-made plans", () => {
  it("cover days A, B and C for every equipment type", () => {
    expect(programs.map((p) => `${p.equipment_type}:${p.day_number}`)).toEqual([
      "barbell:1", "barbell:2", "barbell:3",
      "dumbbells:1", "dumbbells:2", "dumbbells:3",
      "full-gym:1", "full-gym:2", "full-gym:3",
    ]);
  });

  it("only use exercises that exist", () => {
    const ids = new Set(exercises.map((e) => e.id));
    const broken = programs.flatMap((p) => p.exercise_ids_list.filter((id) => !ids.has(id)).map((id) => `${p.equipment_type}:${p.day_number}:${id}`));
    expect(broken).toEqual([]);
  });
});

describe("migrations", () => {
  it("can safely re-run the exercise seed", async () => {
    const seed = migrationFiles().find((f) => f.includes("seed_exercise_library"));
    expect(seed).toBeDefined();
    await t.db.exec(readMigration(seed!));
    expect(await t.rows(`SELECT id FROM exercises`)).toHaveLength(34);
    expect(await t.rows(`SELECT id FROM workout_programs`)).toHaveLength(9);
  });

  it("are named with a unique timestamp prefix", () => {
    const versions = migrationFiles().map((f) => f.split("_")[0]);
    expect(versions.every((v) => /^\d{14}$/.test(v ?? ""))).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
