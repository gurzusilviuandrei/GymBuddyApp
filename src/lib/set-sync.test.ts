import { describe, expect, it, vi } from "vitest";
import type { CachedSet } from "./active-session";
import { allSaved, flushPending, nextRetryDelay, RETRY_MAX_MS, RETRY_MIN_MS, syncSet, type SyncApi, type SyncEnv, type SyncStore } from "./set-sync";

const set = (key: string, over: Partial<CachedSet> = {}): CachedSet => ({
  key,
  id: null,
  exercise_index: 0,
  exercise_id: "goblet-squat",
  set_number: 1,
  weight_kg: 40,
  reps: 10,
  status: "syncing",
  ...over,
});

function harness(initial: CachedSet[], { online = true } = {}) {
  let sets = initial;
  let isOnline = online;
  let pendingDeletes: string[] = [];
  const store: SyncStore = {
    get: () => sets,
    commit: (fn) => {
      sets = fn(sets);
    },
  };
  const api = {
    log: vi.fn<SyncApi["log"]>(async (s) => ({ id: `row-${s.key}`, is_personal_record: false })),
    update: vi.fn<SyncApi["update"]>(async () => ({})),
    remove: vi.fn<SyncApi["remove"]>(async () => ({})),
  };
  const env: SyncEnv = {
    online: () => isOnline,
    timeoutMs: 50,
    addPendingDelete: (id) => {
      pendingDeletes = [...pendingDeletes, id];
    },
    readPendingDeletes: () => pendingDeletes,
    removePendingDelete: (id) => {
      pendingDeletes = pendingDeletes.filter((x) => x !== id);
    },
  };
  return {
    store,
    api,
    env,
    sets: () => sets,
    find: (key: string) => sets.find((s) => s.key === key),
    setOnline: (v: boolean) => {
      isOnline = v;
    },
    pendingDeletes: () => pendingDeletes,
    sync: (key: string, onPr?: (s: CachedSet) => void) => syncSet(key, store, api, env, onPr),
  };
}

describe("syncSet", () => {
  it("saves a set and records its server id", async () => {
    const h = harness([set("a")]);
    await h.sync("a");
    expect(h.find("a")).toMatchObject({ id: "row-a", status: "saved" });
    expect(h.api.log).toHaveBeenCalledTimes(1);
  });

  it("keeps the set on the device straight away when there is no signal", async () => {
    const h = harness([set("a")], { online: false });
    await h.sync("a");
    expect(h.find("a")).toMatchObject({ id: null, status: "local" });
    expect(h.api.log).not.toHaveBeenCalled();
  });

  it("keeps the set on the device when the upload fails", async () => {
    const h = harness([set("a")]);
    h.api.log.mockRejectedValueOnce(new Error("500"));
    await h.sync("a");
    expect(h.find("a")?.status).toBe("local");
  });

  it("gives up on a hanging upload after the timeout and keeps the set", async () => {
    const h = harness([set("a")]);
    h.api.log.mockReturnValueOnce(new Promise(() => {}));
    await h.sync("a");
    expect(h.find("a")?.status).toBe("local");
  });

  it("does nothing for a set that is already saved or gone", async () => {
    const h = harness([set("a", { id: "row-a", status: "saved" })]);
    await h.sync("a");
    await h.sync("missing");
    expect(h.api.log).not.toHaveBeenCalled();
  });

  it("celebrates a personal record once the server confirms it", async () => {
    const h = harness([set("a")]);
    h.api.log.mockResolvedValueOnce({ id: "row-a", is_personal_record: true });
    const onPr = vi.fn();
    await h.sync("a", onPr);
    expect(onPr).toHaveBeenCalledWith(expect.objectContaining({ key: "a" }));
  });

  it("removes the server copy of a set deleted while it was uploading", async () => {
    const h = harness([set("a")]);
    h.api.log.mockImplementationOnce(async () => {
      h.store.commit(() => []); // member deletes the set mid-upload
      return { id: "row-a", is_personal_record: false };
    });
    await h.sync("a");
    expect(h.api.remove).toHaveBeenCalledWith("row-a");
    expect(h.sets()).toEqual([]);
  });

  it("remembers that deletion for later if the server can't be reached", async () => {
    const h = harness([set("a")]);
    h.api.remove.mockRejectedValueOnce(new Error("offline"));
    h.api.log.mockImplementationOnce(async () => {
      h.store.commit(() => []);
      return { id: "row-a", is_personal_record: false };
    });
    await h.sync("a");
    await Promise.resolve();
    expect(h.pendingDeletes()).toEqual(["row-a"]);
  });

  it("sends a correction made while the set was uploading", async () => {
    const h = harness([set("a", { weight_kg: 40, reps: 10 })]);
    h.api.log.mockImplementationOnce(async () => {
      h.store.commit((prev) => prev.map((s) => ({ ...s, weight_kg: 42.5, reps: 8 })));
      return { id: "row-a", is_personal_record: false };
    });
    await h.sync("a");
    expect(h.api.update).toHaveBeenCalledWith("row-a", 42.5, 8);
    expect(h.find("a")).toMatchObject({ weight_kg: 42.5, reps: 8, status: "saved" });
  });
});

describe("flushPending", () => {
  it("sends stored deletions first, then every waiting set", async () => {
    const h = harness([set("a", { status: "local" }), set("b", { status: "local" }), set("c", { id: "row-c", status: "saved" })]);
    h.env.addPendingDelete("old-row");
    const order: string[] = [];
    h.api.remove.mockImplementation(async (id) => void order.push(`remove ${id}`));
    h.api.log.mockImplementation(async (s) => (order.push(`log ${s.key}`), { id: `row-${s.key}`, is_personal_record: false }));
    const r = await flushPending(h.store, h.api, h.env, (k) => h.sync(k));
    expect(order).toEqual(["remove old-row", "log a", "log b"]);
    expect(r).toEqual({ pendingBefore: 2, deletesBefore: 1, pendingAfter: 0, deletesAfter: 0 });
  });

  it("stops when signal drops and leaves the rest waiting", async () => {
    const h = harness([set("a", { status: "local" }), set("b", { status: "local" })]);
    h.api.log.mockImplementation(async (s) => {
      h.setOnline(false);
      return { id: `row-${s.key}`, is_personal_record: false };
    });
    const r = await flushPending(h.store, h.api, h.env, (k) => h.sync(k));
    expect(h.api.log).toHaveBeenCalledTimes(1);
    expect(r.pendingAfter).toBe(1);
  });

  it("gives up on a hanging deletion instead of stalling every later pass", async () => {
    const h = harness([set("a", { status: "local" })]);
    h.env.addPendingDelete("row-x");
    h.api.remove.mockReturnValueOnce(new Promise(() => {}));
    const r = await flushPending(h.store, h.api, h.env, (k) => h.sync(k));
    expect(r.deletesAfter).toBe(1);
    expect(r.pendingAfter).toBe(1);
  });

  it("keeps a deletion queued when the server rejects it", async () => {
    const h = harness([]);
    h.env.addPendingDelete("row-x");
    h.api.remove.mockRejectedValueOnce(new Error("500"));
    const r = await flushPending(h.store, h.api, h.env, (k) => h.sync(k));
    expect(r.deletesAfter).toBe(1);
  });
});

describe("retry backoff", () => {
  const stuck = { pendingBefore: 2, deletesBefore: 0, pendingAfter: 2, deletesAfter: 0 };
  it("doubles while nothing gets through, up to a minute", () => {
    expect(nextRetryDelay(5000, stuck)).toBe(10_000);
    expect(nextRetryDelay(40_000, stuck)).toBe(RETRY_MAX_MS);
  });
  it("resets as soon as something gets through", () => {
    expect(nextRetryDelay(40_000, { ...stuck, pendingAfter: 1 })).toBe(RETRY_MIN_MS);
  });
});

describe("allSaved", () => {
  it("only allows finishing once every set has reached the account", () => {
    expect(allSaved([set("a", { id: "1" }), set("b", { id: "2" })])).toBe(true);
    expect(allSaved([set("a", { id: "1" }), set("b")])).toBe(false);
    expect(allSaved([])).toBe(true);
  });
});
