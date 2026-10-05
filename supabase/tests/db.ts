// Test harness: a real Postgres (PGlite, in-process) with the parts of Supabase the
// migrations rely on, then every migration in supabase/migrations applied in order.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

// Mirrors Supabase: auth schema, request roles with its default grants, and
// auth.uid() reading the JWT subject that PostgREST sets per request.
const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA extensions;
  CREATE EXTENSION pgcrypto SCHEMA extensions;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  CREATE PUBLICATION supabase_realtime;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}

export function readMigration(file: string): string {
  return readFileSync(join(MIGRATIONS, file), "utf8");
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    const sql = readMigration(file);
    if (!sql.trim()) continue;
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  /** Act as a signed-in member (uid) or a signed-out visitor (null), like a PostgREST request. */
  const as = async (uid: string | null) => {
    await db.exec("RESET ROLE");
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
    await db.exec(uid ? "SET ROLE authenticated" : "SET ROLE anon");
  };

  /** Run as the database owner (setup and assertions that must see everything). */
  const asAdmin = async () => {
    await db.exec("RESET ROLE");
    await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
  };

  /** Call an RPC and return its single value. */
  const rpc = async <T = unknown>(sql: string, params: unknown[] = []): Promise<T> => {
    const { rows } = await db.query<Record<string, T>>(sql, params);
    return Object.values(rows[0] ?? {})[0] as T;
  };

  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> =>
    (await db.query<T>(sql, params)).rows;

  const createUser = async (id: string, email: string, password: string) => {
    await asAdmin();
    await db.query(
      `INSERT INTO auth.users VALUES ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))`,
      [id, email, password],
    );
  };

  return { db, as, asAdmin, rpc, rows, createUser };
}

/** Resolves to the error message, or null when the statement succeeded. */
export async function errorOf(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
