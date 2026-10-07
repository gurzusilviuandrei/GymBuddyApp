// Which unit this member sees and types weights in. The server holds the choice (users.weight_unit);
// the phone keeps a copy in the cached profile, so every screen shows the right unit instantly and
// offline. Until a copy exists it is kilograms (a new member picks a unit during onboarding).
import { useSyncExternalStore } from "react";
import { durableStorage } from "./durable-storage";
import { isWeightUnit, type WeightUnit } from "./weight-units";

const PROFILE_KEY = "gymbuddy-profile";
const CHANGED = "gymbuddy-weight-unit";

export function readWeightUnit(): WeightUnit {
  try {
    const profile = JSON.parse(durableStorage.getItem(PROFILE_KEY) ?? "{}") as { unit?: unknown };
    if (isWeightUnit(profile.unit)) return profile.unit;
  } catch {
    /* unreadable cache: kilograms */
  }
  return "kg";
}

/** Keep the member's unit on the phone and tell every open screen. */
export function rememberWeightUnit(unit: WeightUnit): void {
  if (readWeightUnit() === unit && hasStoredUnit()) return;
  try {
    const existing = JSON.parse(durableStorage.getItem(PROFILE_KEY) ?? "{}") as Record<string, unknown>;
    durableStorage.setItem(PROFILE_KEY, JSON.stringify({ ...existing, unit }));
  } catch {
    /* storage blocked: this session keeps working from the server's answer */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
}

function hasStoredUnit(): boolean {
  try {
    return isWeightUnit((JSON.parse(durableStorage.getItem(PROFILE_KEY) ?? "{}") as { unit?: unknown }).unit);
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The unit for this render; updates every screen when the member changes it. */
export function useWeightUnit(): WeightUnit {
  return useSyncExternalStore(subscribe, readWeightUnit, () => "kg");
}
