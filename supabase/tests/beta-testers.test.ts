// Beta testers get Pro through a private list; everyone else stays on the free tier.
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./db";

const T1 = "55555555-5555-4555-8555-555555555555"; // will be on the list
const T2 = "66666666-6666-4666-8666-666666666666"; // never on the list
const T3 = "77777777-7777-4777-8777-777777777777"; // Pro granted another way (the owner's own account)

let t: TestDb;

const tierOf = async (id: string) => {
  await t.asAdmin();
  const [row] = await t.rows<{ subscription_tier: string; subscription_status: string | null }>(`SELECT subscription_tier, subscription_status FROM users WHERE id = $1`, [id]);
  await t.as(id);
  return row;
};
const start = async (id: string) => {
  await t.as(id);
  await t.rpc(`SELECT public.ensure_user_row()`);
};
const admin = async (sql: string, params: unknown[] = []) => {
  await t.asAdmin();
  await t.db.query(sql, params);
};

beforeAll(async () => {
  t = await createTestDb();
  await t.createUser(T1, "Tester.One@Example.test", "pass-1-1234");
  await t.createUser(T2, "plain@example.test", "pass-2-1234");
  await t.createUser(T3, "owner@example.test", "pass-3-1234");
  for (const id of [T1, T2, T3]) await start(id);
  // The owner's own account, made Pro by hand like the live one.
  await admin(`UPDATE users SET subscription_tier = 'pro' WHERE id = $1`, [T3]);
});

describe("the beta tester list", () => {
  it("cannot be read or changed by members, signed in or not", async () => {
    for (const who of [T1, null]) {
      await t.as(who);
      expect(await errorOf(t.rows(`SELECT * FROM beta_testers`)), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.db.query(`INSERT INTO beta_testers (email) VALUES ('me@example.test')`)), String(who)).toMatch(/permission denied/);
      expect(await errorOf(t.db.query(`DELETE FROM beta_testers`)), String(who)).toMatch(/permission denied/);
    }
    await t.as(T1);
  });

  it("stores emails in lower case, whatever was typed", async () => {
    await admin(`INSERT INTO beta_testers (email, note) VALUES ('  Tester.One@EXAMPLE.test ', 'first tester')`);
    const [row] = await t.rows<{ email: string }>(`SELECT email FROM beta_testers`);
    expect(row?.email).toBe("tester.one@example.test");
  });

  it("refuses something that is not an email", async () => {
    await t.asAdmin();
    expect(await errorOf(t.db.query(`INSERT INTO beta_testers (email) VALUES ('nobody')`))).not.toBeNull();
  });
});

describe("Pro for listed testers", () => {
  it("is granted the next time a listed member opens the app, matching the email in any case", async () => {
    expect(await tierOf(T1)).toEqual({ subscription_tier: "basic", subscription_status: null });
    await start(T1);
    expect(await tierOf(T1)).toEqual({ subscription_tier: "pro", subscription_status: "beta" });
  });

  it("unlocks the Pro functions", async () => {
    await t.as(T1);
    await t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench", "goblet-squat"]]);
    const alts = await t.rpc<unknown[]>(`SELECT public.get_alternative_options('db-bench')`);
    expect(Array.isArray(alts)).toBe(true);
  });

  it("is not given to members who are not on the list", async () => {
    await start(T2);
    expect(await tierOf(T2)).toEqual({ subscription_tier: "basic", subscription_status: null });
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench"]]))).toMatch(/PRO_REQUIRED/);
  });

  it("cannot be obtained by a member adding themselves or by sending a flag", async () => {
    await t.as(T2);
    expect(await errorOf(t.db.query(`INSERT INTO beta_testers (email) VALUES ('plain@example.test')`))).toMatch(/permission denied/);
    expect(await errorOf(t.db.query(`UPDATE users SET subscription_tier = 'pro'`))).toMatch(/permission denied/);
    await start(T2);
    expect(await tierOf(T2)).toMatchObject({ subscription_tier: "basic" });
  });
});

describe("ending the beta", () => {
  it("puts a tester back on the free tier at the next app start once they are off the list", async () => {
    await admin(`DELETE FROM beta_testers`);
    await start(T1);
    expect(await tierOf(T1)).toEqual({ subscription_tier: "basic", subscription_status: null });
    expect(await errorOf(t.rpc(`SELECT public.save_custom_routine($1)`, [["db-bench"]]))).toMatch(/PRO_REQUIRED/);
  });

  it("never touches Pro that was granted another way", async () => {
    await start(T3);
    expect(await tierOf(T3)).toMatchObject({ subscription_tier: "pro" });
  });

  it("keeps working for a member who has no row yet (first sign-in)", async () => {
    const NEW = "88888888-8888-4888-8888-888888888888";
    await t.createUser(NEW, "fresh@example.test", "pass-4-1234");
    await admin(`INSERT INTO beta_testers (email) VALUES ('fresh@example.test')`);
    await start(NEW);
    expect(await tierOf(NEW)).toEqual({ subscription_tier: "pro", subscription_status: "beta" });
  });
});
