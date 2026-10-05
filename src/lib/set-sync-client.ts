// The real server calls and device environment for set-sync.ts, shared by the
// workout screen and the app-wide OfflineSyncWorker so both sync the same way.
import { deleteWorkoutSet, logWorkoutSet, updateWorkoutSet } from "./gym-api";
import { addPendingDelete, readPendingDeletes, removePendingDelete } from "./offline-queue";
import { SYNC_TIMEOUT_MS, type SyncApi, type SyncEnv } from "./set-sync";

export const syncApi: SyncApi = {
  log: (s) =>
    logWorkoutSet({
      data: { exercise_id: s.exercise_id, weight_kg: s.weight_kg, reps_completed: s.reps, set_number: s.set_number, client_key: s.key },
    }),
  update: (id, weightKg, reps) => updateWorkoutSet({ data: { id, weight_kg: weightKg, reps_completed: reps } }),
  remove: (id) => deleteWorkoutSet({ data: { id } }),
};

export const syncEnv: SyncEnv = {
  online: () => navigator.onLine,
  timeoutMs: SYNC_TIMEOUT_MS,
  addPendingDelete,
  readPendingDeletes,
  removePendingDelete,
};
