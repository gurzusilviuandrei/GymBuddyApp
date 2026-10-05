// Getting logged sets to the account despite gym connectivity. The workout screen
// keeps its sets in memory; these functions decide what each set's sync status
// becomes and what reaches the server. No React here, so every edge case is
// unit-tested in set-sync.test.ts.
import type { CachedSet } from "./active-session";

export type SyncApi = {
  /** Idempotent per set key: a retry updates the same row. */
  log(set: CachedSet): Promise<{ id: string; is_personal_record: boolean }>;
  update(id: string, weightKg: number, reps: number): Promise<unknown>;
  remove(id: string): Promise<unknown>;
};

export type SyncStore = {
  get(): CachedSet[];
  commit(updater: (prev: CachedSet[]) => CachedSet[]): void;
};

export type SyncEnv = {
  online(): boolean;
  timeoutMs: number;
  addPendingDelete(id: string): void;
  readPendingDeletes(): string[];
  removePendingDelete(id: string): void;
};

export const SYNC_TIMEOUT_MS = 6000;
export const RETRY_MIN_MS = 5000;
export const RETRY_MAX_MS = 60_000;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const setStatus = (store: SyncStore, key: string, patch: Partial<CachedSet>) =>
  store.commit((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));

/**
 * Upload one set. Outcomes: "saved" with its server id; "local" when there is no
 * signal or the upload failed (retried later). Handles the set being deleted or
 * corrected while its upload was in flight.
 */
export async function syncSet(
  key: string,
  store: SyncStore,
  api: SyncApi,
  env: SyncEnv,
  onPersonalRecord?: (set: CachedSet) => void,
): Promise<void> {
  const item = store.get().find((x) => x.key === key);
  if (!item || item.id) return;
  // No signal: keep it local instantly instead of waiting for a timeout.
  if (!env.online()) {
    setStatus(store, key, { status: "local" });
    return;
  }
  setStatus(store, key, { status: "syncing" });
  try {
    const row = await withTimeout(api.log(item), env.timeoutMs);
    const current = store.get().find((x) => x.key === key);
    if (!current) {
      // Deleted while syncing — remove the server copy too.
      api.remove(row.id).catch(() => env.addPendingDelete(row.id));
      return;
    }
    setStatus(store, key, { id: row.id, status: "saved" });
    if (row.is_personal_record) onPersonalRecord?.(item);
    // Corrected while syncing — the server has the old numbers.
    if (current.weight_kg !== item.weight_kg || current.reps !== item.reps) {
      api.update(row.id, current.weight_kg, current.reps).catch(() => {});
    }
  } catch {
    setStatus(store, key, { status: "local" });
  }
}

export type FlushResult = { pendingBefore: number; deletesBefore: number; pendingAfter: number; deletesAfter: number };

/**
 * One retry pass: first deletions stored on the device (so a set removed offline
 * never comes back), then every set still waiting. Stops early if signal drops.
 */
export async function flushPending(
  store: SyncStore,
  api: SyncApi,
  env: SyncEnv,
  sync: (key: string) => Promise<void>,
): Promise<FlushResult> {
  const pending = store.get().filter((s) => s.status === "local");
  const deletes = env.readPendingDeletes();
  try {
    for (const id of deletes) {
      if (!env.online()) break;
      await withTimeout(api.remove(id), env.timeoutMs);
      env.removePendingDelete(id);
    }
    for (const x of pending) {
      if (!env.online()) break;
      await sync(x.key);
    }
  } catch {
    /* retried on the next pass */
  }
  // Counted over what this pass started with: a set logged or deleted meanwhile
  // must not make a pass that got everything through look stuck.
  const pendingKeys = new Set(pending.map((s) => s.key));
  return {
    pendingBefore: pending.length,
    deletesBefore: deletes.length,
    pendingAfter: store.get().filter((s) => s.status === "local" && pendingKeys.has(s.key)).length,
    deletesAfter: env.readPendingDeletes().filter((id) => deletes.includes(id)).length,
  };
}

/** Back off (doubling, capped) while a pass makes no progress; reset once it does. */
export function nextRetryDelay(current: number, r: FlushResult): number {
  const stuck = r.pendingAfter >= r.pendingBefore && r.deletesAfter >= r.deletesBefore;
  return stuck ? Math.min(current * 2, RETRY_MAX_MS) : RETRY_MIN_MS;
}

/** A finish may only go out once every set has a server id. */
export function allSaved(sets: CachedSet[]): boolean {
  return sets.every((x) => Boolean(x.id));
}
