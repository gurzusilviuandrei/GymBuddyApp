import { beforeEach, describe, expect, it } from "vitest";
import { abandonActiveSession, ACTIVE_SESSION_KEY, readActiveSession, writeActiveSession, type ActiveSession, type CachedSet } from "./active-session";
import { readOfflineQueue, readPendingDeletes, addPendingDelete, writeOfflineQueue } from "./offline-queue";

// Web storage and window stand-ins (tests run in Node, where the app uses localStorage).
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: { dispatchEvent: () => true },
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const set = (key: string, id: string | null, status: CachedSet["status"]): CachedSet => ({
  key,
  id,
  exercise_index: 0,
  exercise_id: "goblet-squat",
  set_number: 1,
  weight_kg: 40,
  reps: 10,
  status,
});

const forgotten = (): ActiveSession => ({
  current_exercise_index: 1,
  current_set_number: 2,
  is_custom_workout: false,
  swapped_exercises_map: {},
  session_start_time: "2026-10-05T17:00:00.000Z",
  total_exercises: 4,
  logged_set_ids: ["row-a", "row-b"],
  logged_sets: [set("a", "row-a", "saved"), set("b", "row-b", "saved"), set("c", null, "local")],
  last_set_at: Date.parse("2026-10-05T17:40:00.000Z"),
});

beforeEach(() => store.clear());

describe("Discard it (abandoning a forgotten workout)", () => {
  it("queues deletion of the sets already on the account and drops the ones that never left the phone", () => {
    writeActiveSession(forgotten());
    writeOfflineQueue([set("c", null, "local")]);

    abandonActiveSession();

    expect(readActiveSession()).toBeNull();
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(false);
    expect(readOfflineQueue()).toEqual([]); // the never-uploaded set is gone, not waiting to upload
    expect(readPendingDeletes().sort()).toEqual(["row-a", "row-b"]); // the uploaded ones are removed from the account
  });

  it("keeps deletions that were already waiting, and never queues the same set twice", () => {
    addPendingDelete("older-row");
    writeActiveSession(forgotten());

    abandonActiveSession(["row-a"]); // also reported by the screen

    expect(readPendingDeletes().sort()).toEqual(["older-row", "row-a", "row-b"]);
  });

  it("is harmless when nothing was saved", () => {
    expect(() => abandonActiveSession()).not.toThrow();
    expect(readPendingDeletes()).toEqual([]);
  });
});

describe("a forgotten workout survives being closed without a decision", () => {
  it("keeps the last-set time and every set when saved and read back", () => {
    writeActiveSession(forgotten());
    const back = readActiveSession();
    expect(back?.last_set_at).toBe(Date.parse("2026-10-05T17:40:00.000Z"));
    expect(back?.logged_sets).toHaveLength(3);
    // A set that was mid-upload when the app closed is waiting again, never lost.
    expect(back?.logged_sets?.every((x) => x.status !== "syncing")).toBe(true);
  });
});
