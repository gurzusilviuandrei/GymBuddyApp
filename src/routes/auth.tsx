import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserRow } from "@/lib/gym.functions";
import { syncLocalProfile } from "@/lib/account-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Create Your Bro Profile — GymBuddy" },
      { name: "description", content: "Sign up or log in to GymBuddy to save your training plan and track every set." },
      { property: "og:title", content: "Create Your Bro Profile — GymBuddy" },
      { property: "og:description", content: "Sign up or log in to GymBuddy to save your training plan and track every set." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const ensure = useServerFn(ensureUserRow);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const enterApp = async () => {
    const dest = syncLocalProfile(await ensure());
    setLeaving(true);
    setTimeout(() => navigate({ to: dest, replace: true }), 350);
  };

  // Already signed in (or just confirmed email) → go straight in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) enterApp().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) await enterApp();
        else setSentTo(parsed.data.email);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        await enterApp();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg.includes("Invalid login") ? "Wrong email or password" : msg);
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-10 pt-8 text-foreground transition-[transform,opacity] duration-300 ease-out ${leaving ? "-translate-x-8 opacity-0" : "translate-x-0 opacity-100"}`}
    >
      <Link to="/" aria-label="Back to welcome" className="mb-10 inline-flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-5" />
      </Link>

      {sentTo ? (
        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <MailCheck className="size-16 text-primary drop-shadow-[0_0_18px_var(--primary)]" strokeWidth={1.4} />
          <h1 className="mt-8 text-3xl font-semibold">Check your email</h1>
          <p className="mt-4 text-muted-foreground">
            We sent a confirmation link to <span className="text-foreground">{sentTo}</span>. Tap it to activate your Bro Profile and start onboarding.
          </p>
          <button type="button" onClick={() => { setSentTo(null); setMode("login"); }} className="mt-10 text-sm font-medium text-primary underline-offset-4 hover:underline">
            Already confirmed? Log in
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="flex flex-1 flex-col">
          <h1 className="text-[2.1rem] font-semibold leading-tight">
            {isSignup ? "Create Your Bro Profile" : "Welcome back, Bro"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {isSignup ? "Save your plan and track every set." : "Log in to pick up where you left off."}
          </p>

          <div className="mt-12 flex flex-col gap-5">
            <Input type="email" autoComplete="email" placeholder="Enter your email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-14 rounded-lg border-border bg-card px-4 text-base" />
            <Input type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder={isSignup ? "Create a password" : "Your password"} aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-14 rounded-lg border-border bg-card px-4 text-base" />
          </div>

          <Button type="submit" size="lg" disabled={busy} className="mt-10 h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]">
            {busy ? "One sec…" : isSignup ? "Sign Up & Start" : "Welcome Back: Login"}
          </Button>

          <button type="button" onClick={() => setMode(isSignup ? "login" : "signup")} className="mt-6 text-center text-sm text-muted-foreground hover:text-foreground">
            {isSignup ? <>Already have an account? <span className="font-medium text-primary">Log in</span></> : <>New here? <span className="font-medium text-primary">Create a profile</span></>}
          </button>
        </form>
      )}
    </main>
  );
}
