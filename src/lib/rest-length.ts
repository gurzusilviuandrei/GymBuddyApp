// The rest length a member picks (45, 60, 90 or 120 seconds) is remembered for their next
// workouts. Without a choice, the default stays: 90 seconds, or 120 when they feel very sore.
// A plain preference, like the chime mute: it survives sign-out and is not per-account data.
import { REST_OPTIONS } from "./workout-logic";

export const REST_LENGTH_KEY = "gymbuddy-rest-secs";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The length the member chose last time, or null when they never chose (or the value is not one of the options). */
export function readRestLength(store: KeyValueStore | null = defaultStore()): number | null {
  try {
    const n = Number(store?.getItem(REST_LENGTH_KEY));
    return (REST_OPTIONS as readonly number[]).includes(n) ? n : null;
  } catch {
    return null;
  }
}

export function rememberRestLength(seconds: number, store: KeyValueStore | null = defaultStore()): void {
  if (!(REST_OPTIONS as readonly number[]).includes(seconds)) return;
  try {
    store?.setItem(REST_LENGTH_KEY, String(seconds));
  } catch {
    /* storage blocked: the choice lasts for this workout only, as before */
  }
}
