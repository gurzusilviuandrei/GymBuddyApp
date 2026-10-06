import { describe, expect, it } from "vitest";
import { fetchAllPages, IncompleteReadError, readEntireTable, type PageReader } from "./paging";

/** A fake table that, like Supabase, never returns more than `cap` rows per request. */
function fakeTable(size: number, cap = 1000) {
  const all = Array.from({ length: size }, (_, i) => ({ id: i }));
  const requests: Array<[number, number]> = [];
  const page: PageReader<{ id: number }> = async (from, to) => {
    requests.push([from, to]);
    return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  const count = async () => ({ count: size, error: null });
  return { all, page, count, requests };
}

describe("reading a whole table past the server's row cap", () => {
  it("returns every row of a table far over 1,000 rows, in order, with no gaps or repeats", async () => {
    const t = fakeTable(2500);
    const rows = await readEntireTable(t.count, t.page);
    expect(rows).toHaveLength(2500);
    expect(rows.map((r) => r.id)).toEqual(t.all.map((r) => r.id));
    expect(t.requests).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("handles exactly one full page, and an empty table without asking for rows", async () => {
    const full = fakeTable(1000);
    expect(await readEntireTable(full.count, full.page)).toHaveLength(1000);
    expect(full.requests).toHaveLength(1);
    const empty = fakeTable(0);
    expect(await readEntireTable(empty.count, empty.page)).toEqual([]);
    expect(empty.requests).toEqual([]);
  });

  it("does not assume the server's cap: a server that returns only 400 rows a request still works", async () => {
    const t = fakeTable(1300, 400);
    const rows = await readEntireTable(t.count, t.page);
    expect(rows).toHaveLength(1300);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1300);
  });

  it("fails instead of returning a partial result when the server stops returning rows", async () => {
    const t = fakeTable(2500);
    const stopsEarly: PageReader<{ id: number }> = async (from, to) => (from >= 1000 ? { data: [], error: null } : t.page(from, to));
    await expect(readEntireTable(t.count, stopsEarly)).rejects.toThrow(IncompleteReadError);
    await expect(readEntireTable(t.count, stopsEarly)).rejects.toMatchObject({ got: 1000, expected: 2500 });
  });

  it("passes on an error from the middle of the read", async () => {
    const t = fakeTable(2500);
    const boom = new Error("network down");
    const failsOnSecondPage: PageReader<{ id: number }> = async (from, to) => (from >= 1000 ? { data: null, error: boom } : t.page(from, to));
    await expect(fetchAllPages(2500, failsOnSecondPage)).rejects.toBe(boom);
  });

  it("fails when the row count itself cannot be read", async () => {
    const t = fakeTable(10);
    await expect(readEntireTable(async () => ({ count: null, error: new Error("denied") }), t.page)).rejects.toThrow("denied");
    await expect(readEntireTable(async () => ({ count: null, error: null }), t.page)).rejects.toThrow("Could not count rows");
  });
});
