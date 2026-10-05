// Account settings, data export and deletion for the signed-in member.
import { supabase } from "@/integrations/supabase/client";

async function currentUser() {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function getAccountSettings() {
  const user = await currentUser();
  const { data: profile, error } = await supabase
    .from("users")
    .select("full_name, subscription_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("Could not load account settings");
  return {
    fullName: profile?.full_name ?? "GymBuddy Member",
    email: user.email ?? "",
    tier: profile?.subscription_tier === "pro" ? ("pro" as const) : ("free" as const),
  };
}

export async function updateAccountEmail({ data }: { data: { email: string } }) {
  const { error } = await supabase.auth.updateUser({ email: data.email });
  if (error) throw new Error(error.message);
  return { email: data.email };
}

export async function exportMyData() {
  const user = await currentUser();
  const [profile, logs, sessions] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("workout_logs").select("*").eq("user_id", user.id).order("timestamp"),
    supabase.from("workout_sessions").select("*").eq("user_id", user.id).order("completed_at"),
  ]);
  if (profile.error || logs.error || sessions.error) throw new Error("Could not export your data");
  return {
    exported_at: new Date().toISOString(),
    account: { email: user.email ?? null, profile: profile.data },
    workout_logs: logs.data ?? [],
    workout_sessions: sessions.data ?? [],
  };
}

// The database re-checks the password before permanently deleting everything.
export async function deleteAccount({ data }: { data: { confirmation: "DELETE"; password: string } }) {
  const { data: result, error } = await supabase.rpc("delete_account", { p_password: data.password });
  if (error) throw new Error("Could not delete your account");
  return result as { deleted: boolean; reason: "invalid_password" | null };
}
