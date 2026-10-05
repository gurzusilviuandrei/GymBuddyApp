import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { logWorkoutSet, deleteWorkoutSet } from "@/lib/gym-api";
import { readActiveSession, writeActiveSession } from "@/lib/active-session";
import {
  QUEUE_EVENT,
  readOfflineQueue,
  writeOfflineQueue,
  readPendingDeletes,
  removePendingDelete,
  withSyncLock,
} from "@/lib/offline-queue";

/**
 * App-wide background sync for sets left in the offline queue. Mounted once in the
 * authenticated layout so queued sets reach the account from any screen (Home,
 * History, Profile, …) as soon as signal returns. The workout tracker owns its own
 * retry loop while a session is open, so this worker stands down on that route.
 */
export function OfflineSyncWorker() {
  const logSet = logWorkoutSet;
  const removeSet = deleteWorkoutSet;
  const onWorkout = useRouterState({
    select: (s) => s.location.pathname.startsWith("/workout"),
  });

  useEffect(() => {
    if (onWorkout) return;
    let running = false;
    let timer = 0;
    let delay = 5000;
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
      if (readOfflineQueue().length === 0 && readPendingDeletes().length === 0) {
        delay = 5000;
        return;
      }
      if (!navigator.onLine) {
        schedule();
        return;
      }
      running = true;
      try {
        // One tab at a time across the whole browser: without this, a second tab
        // could upload its older copy of a set over an edit made here.
        const gotLock = await withSyncLock(async () => {
          // Removals first, so a set deleted offline can never be re-uploaded
          // and then linger on the account.
          for (const id of readPendingDeletes()) {
            if (cancelled || !navigator.onLine) break;
            await removeSet({ data: { id } });
            removePendingDelete(id);
          }
          for (const queued of readOfflineQueue()) {
            if (cancelled || !navigator.onLine) break;
            // Re-read the set by key: another tab may have corrected it since.
            const item = readOfflineQueue().find((x) => x.key === queued.key);
            if (!item) continue;
            const row = await logSet({
              data: {
                exercise_id: item.exercise_id,
                weight_kg: item.weight_kg,
                reps_completed: item.reps,
                set_number: item.set_number,
                client_key: item.key,
              },
            });
            writeOfflineQueue(readOfflineQueue().filter((x) => x.key !== item.key));
            const s = readActiveSession();
            if (s) {
              writeActiveSession({
                ...s,
                // De-duplicate: a retried set returns the same row id, and a repeat
                // entry would later fail completion with "Duplicate logged sets".
                logged_set_ids: [...new Set([...s.logged_set_ids, row.id])],
                logged_sets: (s.logged_sets ?? []).map((x) =>
                  x.key === item.key ? { ...x, id: row.id, status: "saved" as const } : x,
                ),
              });
            }
          }
        });
        // Another tab holds the lock — try again shortly rather than racing it.
        delay = gotLock ? 5000 : 3000;
        if (!gotLock) schedule();
      } catch {
        delay = Math.min(delay * 2, 60000); // still spotty — back off
      } finally {
        running = false;
        if (readOfflineQueue().length > 0 || readPendingDeletes().length > 0) schedule();
      }
    };

    const kick = () => {
      delay = 5000;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWorkout]);

  return null;
}
