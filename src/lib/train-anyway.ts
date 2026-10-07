// Once the weekly target is met (or a workout is done today) Home shows Rest & Recovery
// instead of the workout buttons. "Train anyway" brings the buttons back; this keeps that
// choice for the rest of the day, so the member doesn't have to tap it every time they
// open the app. It is per account (device-owner.ts erases it with the other account data).
import { localDayKey } from "./activity";

export const TRAIN_ANYWAY_KEY = "gymbuddy-train-anyway";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** True when the member chose "Train anyway" earlier on this same calendar day (the phone's own). */
export function readTrainAnywayToday(now: Date = new Date(), store: KeyValueStore | null = defaultStore()): boolean {
  try {
    return store?.getItem(TRAIN_ANYWAY_KEY) === localDayKey(now);
  } catch {
    return false;
  }
}

export function rememberTrainAnywayToday(now: Date = new Date(), store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(TRAIN_ANYWAY_KEY, localDayKey(now));
  } catch {
    /* storage blocked: the choice lasts until the screen closes, as before */
  }
}
