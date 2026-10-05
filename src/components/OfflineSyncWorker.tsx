import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { readActiveSession, writeActiveSession, type CachedSet } from "@/lib/active-session";
import { QUEUE_EVENT, readOfflineQueue, readPendingDeletes, writeOfflineQueue, withSyncLock } from "@/lib/offline-queue";
import { flushPending, nextRetryDelay, RETRY_MIN_MS, syncSet, type FlushResult, type SyncStore } from "@/lib/set-sync";
import { syncApi, syncEnv } from "@/lib/set-sync-client";

// The offline queue as a set-sync store. A set marked "syncing" when the app was
// closed is waiting again. Once a set is saved it leaves the queue, and the workout
// in progress (if any) records its server id for the finish.
const queueStore: SyncStore = {
  get: () => readOfflineQueue().map((x) => (x.status === "syncing" ? { ...x, status: "local" as const } : x)),
  commit: (updater) => {
    const next = updater(queueStore.get());
    const saved = next.filter((x) => x.id);
    writeOfflineQueue(next.filter((x) => !x.id));
    if (saved.length > 0) recordSaved(saved);
  },
};

function recordSaved(saved: CachedSet[]) {
  const s = readActiveSession();
  if (!s) return;
  const byKey = new Map(saved.map((x) => [x.key, x]));
  writeActiveSession({
    ...s,
    // De-duplicate: a retried set returns the same row id, and a repeat entry
    // would later fail completion with "Duplicate logged sets".
    logged_set_ids: [...new Set([...s.logged_set_ids, ...saved.flatMap((x) => (x.id ? [x.id] : []))])],
    logged_sets: (s.logged_sets ?? []).map((x) => {
      const done = byKey.get(x.key);
      return done ? { ...x, id: done.id, status: "saved" as const } : x;
    }),
  });
}

const hasWork = () => readOfflineQueue().length > 0 || readPendingDeletes().length > 0;

/**
 * App-wide background sync for sets left in the offline queue. Mounted once in the
 * authenticated layout so queued sets reach the account from any screen (Home,
 * History, Profile, …) as soon as signal returns. Uses the same tested sync steps
 * as the workout screen (src/lib/set-sync.ts), which owns syncing while it is open,
 * so this worker stands down on that route.
 */
export function OfflineSyncWorker() {
  const onWorkout = useRouterState({
    select: (s) => s.location.pathname.startsWith("/workout"),
  });

  useEffect(() => {
    if (onWorkout) return;
    let running = false;
    let timer = 0;
    let delay = RETRY_MIN_MS;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        void flush();
      }, delay);
    };

    const flush = async () => {
      if (cancelled || running) return;
      if (!hasWork()) {
        delay = RETRY_MIN_MS;
        return;
      }
      if (!navigator.onLine) {
        schedule();
        return;
      }
      running = true;
      const pass: { result?: FlushResult } = {};
      try {
        // One tab at a time across the whole browser: without this, a second tab
        // could upload its older copy of a set over an edit made here.
        const gotLock = await withSyncLock(async () => {
          pass.result = await flushPending(queueStore, syncApi, syncEnv, (key) => syncSet(key, queueStore, syncApi, syncEnv));
        });
        // Another tab holds the lock: try again shortly rather than racing it.
        delay = !gotLock ? 3000 : pass.result ? nextRetryDelay(delay, pass.result) : RETRY_MIN_MS;
      } finally {
        running = false;
        if (hasWork()) schedule();
      }
    };

    // Signal back, app reopened or a new set queued: retry now. Ignored mid-pass,
    // where the pass's own queue writes would otherwise reset the backoff.
    const kick = () => {
      if (running) return;
      delay = RETRY_MIN_MS;
      void flush();
    };
    void flush();
    window.addEventListener("online", kick);
    window.addEventListener("focus", kick);
    window.addEventListener(QUEUE_EVENT, kick);
    return () => {
      cancelled = true;
      window.removeEventListener("online", kick);
      window.removeEventListener("focus", kick);
      window.removeEventListener(QUEUE_EVENT, kick);
      if (timer) window.clearTimeout(timer);
    };
  }, [onWorkout]);

  return null;
}
