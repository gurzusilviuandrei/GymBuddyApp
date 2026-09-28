import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { logWorkoutSet } from "@/lib/gym.functions";
import { readActiveSession, writeActiveSession } from "@/lib/active-session";
import { QUEUE_EVENT, readOfflineQueue, writeOfflineQueue } from "@/lib/offline-queue";

/**
 * App-wide background sync for sets left in the offline queue. Mounted once in the
 * authenticated layout so queued sets reach the account from any screen (Home,
 * History, Profile, …) as soon as signal returns. The workout tracker owns its own
 * retry loop while a session is open, so this worker stands down on that route.
 */
export function OfflineSyncWorker() {
  const logSet = useServerFn(logWorkoutSet);
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
      const queue = readOfflineQueue();
      if (queue.length === 0) {
        delay = 5000;
        return;
      }
      if (!navigator.onLine) {
        schedule();
        return;
      }
      running = true;
      try {
        for (const item of queue) {
          if (cancelled || !navigator.onLine) break;
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
              logged_set_ids: [...s.logged_set_ids, row.id],
              logged_sets: (s.logged_sets ?? []).map((x) =>
                x.key === item.key ? { ...x, id: row.id, status: "saved" as const } : x,
              ),
            });
          }
        }
        delay = 5000;
      } catch {
        delay = Math.min(delay * 2, 60000); // still spotty — back off
      } finally {
        running = false;
        if (readOfflineQueue().length > 0) schedule();
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
