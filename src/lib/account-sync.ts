import { durableStorage } from "@/lib/durable-storage";

type EnsureResult = {
  userId: string;
  onboarded: boolean;
  fullName: string | null;
  frequency: string | null;
  goal: string | null;
  equipment: string | null;
};

/** Store the signed-in account's profile locally and return where to send them. */
export function syncLocalProfile(r: EnsureResult): "/home" | "/onboarding" {
  const profile: Record<string, unknown> = { userId: r.userId };
  if (r.fullName) profile["name"] = r.fullName;
  if (r.frequency) profile["frequency"] = r.frequency;
  if (r.goal) profile["goal"] = r.goal;
  if (r.equipment) profile["equipment"] = r.equipment;
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(durableStorage.getItem("gymbuddy-profile") ?? "{}");
    if (existing["userId"] !== r.userId) existing = {};
  } catch {
    existing = {};
  }
  durableStorage.setItem("gymbuddy-profile", JSON.stringify({ ...existing, ...profile }));
  return r.onboarded ? "/home" : "/onboarding";
}

/** The profile cached on this device for `userId`, if any (used when offline). */
export function readLocalProfile(userId: string): Record<string, unknown> | null {
  try {
    const profile = JSON.parse(durableStorage.getItem("gymbuddy-profile") ?? "null") as Record<string, unknown> | null;
    return profile && profile["userId"] === userId ? profile : null;
  } catch {
    return null;
  }
}
