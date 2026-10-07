// Account settings, data export and deletion for the signed-in member.
import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "@/lib/platform";
import { readEntireTable } from "@/lib/paging";

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
  // The confirmation links reopen the app on a phone (see NativeBridge).
  const { error } = await supabase.auth.updateUser({ email: data.email }, { emailRedirectTo: authRedirectUrl("/") });
  if (error) throw new Error(error.message);
  return { email: data.email };
}

// Everything the app stores about the member. The server returns at most 1,000 rows per
// request, so each table is counted and then read page by page (see paging.ts); if the
// pages don't add up to the count the export fails rather than hand over a short file.
// The file states its own row counts so they can be checked against the app.
export async function exportMyData() {
  const user = await currentUser();
  const [profile, logs, sessions, settings] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    readEntireTable(
      () => supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      (from, to) => supabase.from("workout_logs").select("*").eq("user_id", user.id).order("timestamp").order("id").range(from, to),
    ),
    readEntireTable(
      () => supabase.from("workout_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      (from, to) => supabase.from("workout_sessions").select("*").eq("user_id", user.id).order("completed_at").order("id").range(from, to),
    ),
    readEntireTable(
      () => supabase.from("user_machine_settings").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      (from, to) => supabase.from("user_machine_settings").select("*").eq("user_id", user.id).order("exercise_id").order("id").range(from, to),
    ),
  ]);
  if (profile.error) throw new Error("Could not export your data");
  return {
    exported_at: new Date().toISOString(),
    // Every weight in this file is in kilograms, whatever unit the member sees in the app.
    units: { weight: "kg" },
    account: { email: user.email ?? null, profile: profile.data },
    workout_logs: logs,
    workout_sessions: sessions,
    machine_settings: settings,
    counts: { workout_logs: logs.length, workout_sessions: sessions.length, machine_settings: settings.length },
  };
}

// The database re-checks the password before permanently deleting everything.
export async function deleteAccount({ data }: { data: { confirmation: "DELETE"; password: string } }) {
  const { data: result, error } = await supabase.rpc("delete_account", { p_password: data.password });
  if (error) throw new Error("Could not delete your account");
  return result as { deleted: boolean; reason: "invalid_password" | null };
}
