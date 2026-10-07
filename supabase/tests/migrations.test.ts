// The migration folder is the record of the database. These checks keep it trustworthy:
// well-formed names, a strict order, and a list of applied migrations that is never stale.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./db";

const migrationsDir = new URL("../migrations/", import.meta.url);
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

describe("migration files", () => {
  it("are named <14-digit timestamp>_<name>.sql, so the Supabase CLI can read them", () => {
    const bad = files.filter((f) => !/^\d{14}_[\w-]+\.sql$/.test(f));
    expect(bad).toEqual([]);
  });

  it("have unique timestamps (a clash would apply in an unpredictable order)", () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("are not empty", () => {
    expect(files.length).toBeGreaterThan(20);
  });
});

describe("record-applied-migrations.sql, run on a real Postgres", () => {
  it("records every migration exactly once, even when pasted twice", async () => {
    const t = await createTestDb();
    const sql = readFileSync(new URL("../record-applied-migrations.sql", import.meta.url), "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql);
    const rows = await t.rows<{ version: string; name: string }>(`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`);
    expect(rows.map((r) => r.version)).toEqual(files.map((f) => f.slice(0, 14)));
    expect(rows.at(-1)?.name).toBe(files.at(-1)?.slice(15, -4));
  });
});

describe("record-applied-migrations.sql", () => {
  it("lists every migration (run `npm run migrations:record` after adding one)", () => {
    const run = () =>
      execFileSync(process.execPath, ["scripts/record-migrations.mjs", "--check"], { encoding: "utf8", stdio: "pipe" });
    expect(run).not.toThrow();
  });
});
