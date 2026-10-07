// Account data kept on the phone (sets waiting for signal, the workout in progress,
// the cached profile, Pro status and the offline data cache) belongs to one account.
// It is stamped with that account's id, and dropped as soon as a different account
// signs in on the same phone, so one member's sets can never upload to another's.
// Signing out keeps it: if the same member signs back in, waiting sets still sync.
import { durableStorage } from "./durable-storage";

export const DEVICE_OWNER_KEY = "gymbuddy-device-owner";

/** Durable keys holding one account's data (see DURABLE_KEYS). */
export const ACCOUNT_DATA_KEYS = [
  "gymbuddy-active-session",
  "gymbuddy_offline_queue",
  "gymbuddy_pending_deletes",
  "gymbuddy-profile",
  "gymbuddy-pro",
  "gymbuddy-query-cache",
] as const;

// Per-account conveniences that live in plain WebView storage.
const ACCOUNT_WEB_KEYS = ["gymbuddy-bag-checklist", "gymbuddy-train-anyway"];

/** Erase every account's data from this phone (e.g. after deleting the account). */
export function clearAccountData() {
  for (const key of ACCOUNT_DATA_KEYS) durableStorage.removeItem(key);
  durableStorage.removeItem(DEVICE_OWNER_KEY);
  for (const key of ACCOUNT_WEB_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("gymbuddy-offline-queue"));
}

// Installs from before the owner stamp: the cached profile records its account.
function legacyOwner(): string | null {
  try {
    const profile = JSON.parse(durableStorage.getItem("gymbuddy-profile") ?? "null") as { userId?: unknown } | null;
    return typeof profile?.userId === "string" ? profile.userId : null;
  } catch {
    return null;
  }
}

/**
 * Hand this phone's account data to `userId`. Returns true when another account's
 * data was found and erased, so in-memory caches must be dropped too.
 */
export function claimDeviceData(userId: string): boolean {
  const owner = durableStorage.getItem(DEVICE_OWNER_KEY) ?? legacyOwner();
  const otherAccount = owner !== null && owner !== userId;
  if (otherAccount) clearAccountData();
  if (owner !== userId) durableStorage.setItem(DEVICE_OWNER_KEY, userId);
  return otherAccount;
}
