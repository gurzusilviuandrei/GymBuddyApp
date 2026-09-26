import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — GymBuddy" },
      { name: "description", content: "Choose a new secure password for your GymBuddy account." },
      { property: "og:title", content: "Reset Password — GymBuddy" },
      { property: "og:description", content: "Choose a new secure password for your GymBuddy account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const recoveryLink = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    supabase.auth.getSession().then(({ data }) => setReady(recoveryLink || Boolean(data.session)));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Choose a stronger password");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) throw error;
      setComplete(true);
    } catch {
      toast.error("This reset link is invalid or has expired.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center bg-background px-7 py-12 text-foreground">
      {complete ? (
        <section className="text-center">
          <CheckCircle2 className="mx-auto size-16 text-primary" strokeWidth={1.5} />
          <h1 className="mt-7 text-3xl font-semibold">Password updated</h1>
          <p className="mt-3 text-muted-foreground">Your GymBuddy account is secure and ready.</p>
          <Button asChild size="lg" className="mt-10 h-14 w-full rounded-lg shadow-neon"><Link to="/home">Return to GymBuddy</Link></Button>
        </section>
      ) : (
        <form onSubmit={submit} className="w-full">
          <KeyRound className="size-12 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <h1 className="mt-7 text-3xl font-semibold">Set a new password</h1>
          <p className="mt-3 text-muted-foreground">Use at least 8 characters to protect your Bro profile.</p>
          <Input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready || saving} className="mt-10 h-14 border-border bg-card px-4 text-base" />
          <Button type="submit" size="lg" disabled={!ready || saving} className="mt-5 h-14 w-full rounded-lg shadow-neon">{saving ? "Updating…" : ready ? "Update Password" : "Checking reset link…"}</Button>
        </form>
      )}
    </main>
  );
}