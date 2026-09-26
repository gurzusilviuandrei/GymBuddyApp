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
      tier: "free" as const,
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

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirmation: z.literal("DELETE") }).parse(input))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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