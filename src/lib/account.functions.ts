import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
});

export const getAccountSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("users")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    if (error) throw new Error("Could not load account settings");

    return {
      fullName: profile?.full_name ?? "GymBuddy Member",
      email: typeof context.claims.email === "string" ? context.claims.email : "",
      tier: "free" as "free" | "pro",
    };
  });

export const updateAccountEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => emailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ email: data.email });
    if (error) throw new Error(error.message);
    return { email: data.email };
  });

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profile, logs, sessions] = await Promise.all([
      context.supabase.from("users").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("workout_logs").select("*").eq("user_id", context.userId).order("timestamp"),
      context.supabase.from("workout_sessions").select("*").eq("user_id", context.userId).order("completed_at"),
    ]);
    if (profile.error || logs.error || sessions.error) throw new Error("Could not export your data");
    return {
      exported_at: new Date().toISOString(),
      account: {
        email: typeof context.claims.email === "string" ? context.claims.email : null,
        profile: profile.data,
      },
      workout_logs: logs.data ?? [],
      workout_sessions: sessions.data ?? [],
    };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ confirmation: z.literal("DELETE"), password: z.string().min(1).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const email = typeof context.claims.email === "string" ? context.claims.email : "";
    if (!email) throw new Error("Could not verify identity");

    // Fresh re-authentication: verify the password with a throwaway client.
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const verifier = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: check, error: checkError } = await verifier.auth.signInWithPassword({ email, password: data.password });
    if (checkError || check.user?.id !== context.userId) throw new Error("INVALID_PASSWORD");
    await verifier.auth.signOut({ scope: "local" }).catch(() => {});

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("workout_sessions").delete().eq("user_id", context.userId);

    const { error: logsError } = await supabaseAdmin
      .from("workout_logs")
      .delete()
      .eq("user_id", context.userId);
    if (logsError) throw new Error("Could not delete workout history");

    const { error: profileError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", context.userId);
    if (profileError) throw new Error("Could not delete profile");

    const { error: accountError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (accountError) throw new Error("Could not delete login account");

    return { deleted: true };
  });