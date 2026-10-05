// Storage for data a member must never lose: sets logged offline, the workout in
// progress, the cached profile and the offline data cache. On phones it lives in
// native storage (Capacitor Preferences), because the OS may clear WebView storage
// (notably on iOS). Reads stay synchronous: everything is loaded into memory once
// at start-up by initDurableStorage(), and writes go to memory and native storage.
import { Preferences } from "@capacitor/preferences";
import { isNativeApp } from "./platform";

export const DURABLE_KEYS = [
  "gymbuddy-active-session",
  "gymbuddy_offline_queue",
  "gymbuddy_pending_deletes",
  "gymbuddy-profile",
  "gymbuddy-query-cache",
] as const;

const memory = new Map<string, string>();

function webGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Load durable data into memory. Must finish before the app renders. */
export async function initDurableStorage(): Promise<void> {
  if (!isNativeApp) return;
  await Promise.all(
    DURABLE_KEYS.map(async (key) => {
      const stored = (await Preferences.get({ key })).value;
      // Older installs kept this in WebView storage: carry it over once.
      const value = stored ?? webGet(key);
      if (value === null) return;
      memory.set(key, value);
      if (stored === null) await Preferences.set({ key, value });
    }),
  );
}

export const durableStorage = {
  getItem(key: string): string | null {
    return isNativeApp ? (memory.get(key) ?? null) : webGet(key);
  },
  setItem(key: string, value: string): void {
    if (isNativeApp) {
      memory.set(key, value);
      void Preferences.set({ key, value });
    }
    // Mirrored in WebView storage on phones too, as a second copy.
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage full or blocked: native storage still has it */
    }
  },
  removeItem(key: string): void {
    if (isNativeApp) {
      memory.delete(key);
      void Preferences.remove({ key });
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
