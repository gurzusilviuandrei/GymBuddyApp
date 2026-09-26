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
    existing = JSON.parse(localStorage.getItem("gymbuddy-profile") ?? "{}");
    if (existing["userId"] !== r.userId) existing = {};
  } catch {
    existing = {};
  }
  localStorage.setItem("gymbuddy-profile", JSON.stringify({ ...existing, ...profile }));
  return r.onboarded ? "/home" : "/onboarding";
}
