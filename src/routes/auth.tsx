import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ensureUserRow } from "@/lib/gym.functions";
import { syncLocalProfile } from "@/lib/account-sync";
import { SECURITY_NOTICE, SECURITY_NOTICE_KEY } from "@/components/SessionGuard";
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

const LOCKOUT_KEY = "gymbuddy-login-lockout";
const MAX_ATTEMPTS = 5;

function readLockoutUntil(): number {
  if (typeof window === "undefined") return 0;
  const raw = Number(localStorage.getItem(LOCKOUT_KEY) ?? 0);
  return Number.isFinite(raw) && raw > Date.now() ? raw : 0;
}

function AuthPage() {
  const navigate = useNavigate();
  const ensure = useServerFn(ensureUserRow);
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(() => readLockoutUntil());
  const [now, setNow] = useState(() => Date.now());
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const lockRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const locked = lockRemaining > 0;

  // Only tick while a cooldown is actually counting down.
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);


  const enterApp = async () => {
    const result = await ensure();
    if (result.accountMissing) {
      await supabase.auth.signOut();
      return;
    }
    const dest = syncLocalProfile(result);
    setLeaving(true);
    setTimeout(() => navigate({ to: dest, replace: true }), 350);
  };

  // Already signed in (or just confirmed email) → go straight in.
  useEffect(() => {
    if (sessionStorage.getItem(SECURITY_NOTICE_KEY)) {
      sessionStorage.removeItem(SECURITY_NOTICE_KEY);
      setMode("login");
      toast.warning(SECURITY_NOTICE, { duration: 8000 });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) enterApp().catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendResetLink = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = z.string().trim().email("Enter a valid email").max(255).safeParse(forgotEmail);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSentTo(parsed.data);
    } catch {
      toast.error("Couldn't send the reset link. Try again in a moment.");
    } finally {
      setSendingReset(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked) {
      toast.error(`Too many attempts. Try again in ${lockRemaining}s.`);
      return;
    }
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
        setFailures(0);
        localStorage.removeItem(LOCKOUT_KEY);
        await enterApp();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const wrongCredentials = mode === "login" && (msg.includes("Invalid login") || msg.includes("Invalid credentials"));
      if (wrongCredentials) {
        const next = failures + 1;
        setFailures(next);
        if (next >= MAX_ATTEMPTS) {
          // Escalating cooldown: 60s, then 120s, 180s… for each further block.
          const blocks = Math.max(1, next - MAX_ATTEMPTS + 1);
          const until = Date.now() + blocks * 60_000;
          localStorage.setItem(LOCKOUT_KEY, String(until));
          setLockedUntil(until);
          setNow(Date.now());
          toast.error(`Too many failed attempts. Locked for ${blocks * 60}s.`);
        } else {
          const left = MAX_ATTEMPTS - next;
          toast.error(`Wrong email or password. ${left} ${left === 1 ? "attempt" : "attempts"} left.`);

        }
      } else {
        toast.error(msg);
      }
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

          {!isSignup && (
            <button
              type="button"
              onClick={() => { setForgotEmail(email); setResetSentTo(null); setForgotOpen(true); }}
              className="mt-4 self-end text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          )}

          {locked && (
            <p role="alert" className="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
              Too many failed attempts, Bro. Try again in {lockRemaining}s — or reset your password.
            </p>
          )}

          <Button type="submit" size="lg" disabled={busy || locked} className="mt-10 h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]">
            {busy ? "One sec…" : locked ? `Locked — ${lockRemaining}s` : isSignup ? "Sign Up & Start" : "Welcome Back: Login"}
          </Button>

          <button type="button" onClick={() => setMode(isSignup ? "login" : "signup")} className="mt-6 text-center text-sm text-muted-foreground hover:text-foreground">
            {isSignup ? <>Already have an account? <span className="font-medium text-primary">Log in</span></> : <>New here? <span className="font-medium text-primary">Create a profile</span></>}
          </button>
        </form>
      )}

      {forgotOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-background/90 px-5 pb-8 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="forgot-title" onClick={() => setForgotOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-primary/40 bg-card p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            {resetSentTo ? (
              <>
                <MailCheck className="size-12 text-primary" strokeWidth={1.4} aria-hidden="true" />
                <p id="forgot-title" className="mt-5 text-xl font-semibold text-foreground">Reset link sent</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Check <span className="text-foreground">{resetSentTo}</span> for a secure link to choose a new password.
                </p>
                <Button type="button" onClick={() => setForgotOpen(false)} className="mt-6 h-12 w-full rounded-lg font-semibold">Got it</Button>
              </>
            ) : (
              <form onSubmit={sendResetLink}>
                <p id="forgot-title" className="text-xl font-semibold text-foreground">Reset your password</p>
                <p className="mt-2 text-sm text-muted-foreground">Enter your email and we'll send you a secure reset link.</p>
                <Input
                  type="email"
                  autoComplete="email"
                  aria-label="Email for password reset"
                  placeholder="you@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="mt-5 h-14 rounded-lg border-border bg-background px-4 text-base"
                />
                <Button type="submit" disabled={sendingReset} className="mt-5 h-14 w-full rounded-lg text-base font-semibold shadow-neon">
                  {sendingReset ? "Sending…" : "Send Reset Link"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setForgotOpen(false)} className="mt-2 w-full text-muted-foreground">Cancel</Button>
              </form>
            )}
          </div>
        </div>
      )}

    </main>
  );
}
