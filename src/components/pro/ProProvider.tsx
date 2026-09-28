import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type React from "react";
import { Check, Lock, Loader2, Trophy, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment, getPaddlePriceId, initializePaddle, PRO_PRICE_ID } from "@/lib/paddle";
import { Button } from "@/components/ui/button";

type ProState = {
  isPro: boolean;
  loaded: boolean;
  status: string | null;
  openPaywall: () => void;
  /** Runs `action` when Pro, otherwise slides open the paywall. */
  requirePro: (action: () => void) => void;
};

// Keep a single context instance across hot reloads so an already-mounted
// provider and freshly reloaded consumers always share it.
const globalStore = globalThis as unknown as { __gymbuddyProContext?: React.Context<ProState | null> };
const ProContext = (globalStore.__gymbuddyProContext ??= createContext<ProState | null>(null));

export function usePro() {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("usePro must be used inside ProProvider");
  return ctx;
}

const FEATURES: { label: string; pro: boolean }[] = [
  { label: "Guided 3-day beginner split", pro: false },
  { label: "Set logging, rest timer & form demos", pro: false },
  { label: "Workout history & Bro Cards", pro: false },
  { label: "Custom workout editor", pro: true },
  { label: "Multi-swap when machines are busy", pro: true },
  { label: "Advanced strength analytics graphs", pro: true },
];

export function ProProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>();
  const [isPro, setIsPro] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [opening, setOpening] = useState(false);
  const wasPro = useRef<boolean | null>(null);
  const env = getPaddleEnvironment();

  useEffect(() => {
    const sync = (u: { id: string; email?: string } | null) => {
      setUserId(u?.id ?? null);
      setEmail(u?.email);
    };
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") sync(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) { setIsPro(false); setLoaded(false); wasPro.current = null; return; }
    const { data } = await supabase
      .from("users")
      .select("subscription_tier, subscription_status, subscription_environment")
      .eq("id", userId)
      .maybeSingle();
    const pro = data?.subscription_tier === "pro" && data?.subscription_environment === env;
    if (wasPro.current === false && pro) { setPaywall(false); setCelebrate(true); }
    wasPro.current = pro;
    setIsPro(pro);
    setStatus(data?.subscription_status ?? null);
    setLoaded(true);
  }, [userId, env]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const channel = supabase
      .channel(`pro-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, refresh]);

  // Fallback polling right after checkout in case realtime is slow.
  const pollAfterCheckout = useCallback(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      void refresh();
      if (n >= 15 || wasPro.current) window.clearInterval(id);
    }, 2000);
  }, [refresh]);

  const openPaywall = useCallback(() => setPaywall(true), []);
  const requirePro = useCallback((action: () => void) => {
    if (isPro) action();
    else setPaywall(true);
  }, [isPro]);

  const checkout = async () => {
    if (!userId || opening) return;
    setOpening(true);
    try {
      await initializePaddle((e) => { if (e.name === "checkout.completed") pollAfterCheckout(); });
      const priceId = await getPaddlePriceId(PRO_PRICE_ID);
      window.Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: email ? { email } : undefined,
        customData: { userId },
        settings: {
          displayMode: "overlay",
          theme: "dark",
          successUrl: `${window.location.origin}/home?checkout=success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch {
      toast.error("Checkout couldn't open. Check your connection and try again, Bro.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <ProContext.Provider value={{ isPro, loaded, status, openPaywall, requirePro }}>
      {children}

      {paywall && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-background/80 backdrop-blur-sm animate-fade-in sm:items-center" onClick={() => setPaywall(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-title"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-2 border-primary/40 bg-card p-6 shadow-neon sm:rounded-3xl"
            style={{ animation: "paywall-up 320ms cubic-bezier(.2,.9,.3,1)" }}
          >
            <button type="button" onClick={() => setPaywall(false)} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Zap className="size-7" aria-hidden="true" />
            </div>
            <h2 id="paywall-title" className="mt-4 text-center text-2xl font-bold leading-tight text-foreground">
              Upgrade to Pro status, Bro! ⚡
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">Build your own plan and train smarter.</p>

            <div className="mt-6 grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3 text-sm">
              <span />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Basic</span>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Pro</span>
              {FEATURES.map((f) => (
                <FeatureRow key={f.label} {...f} />
              ))}
            </div>

            <Button
              type="button"
              onClick={checkout}
              disabled={opening || !userId}
              className="mt-7 h-16 w-full rounded-xl text-lg font-bold shadow-neon transition-transform active:scale-[0.98]"
            >
              {opening ? <Loader2 className="animate-spin" /> : "Unlock Pro Access - €9.99/mo"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">Cancel anytime. Your data stays yours.</p>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 p-6 backdrop-blur animate-fade-in" onClick={() => setCelebrate(false)}>
          <div role="alertdialog" aria-labelledby="pro-welcome" className="w-full max-w-sm rounded-3xl border-2 border-primary bg-card p-8 text-center shadow-neon" onClick={(e) => e.stopPropagation()}>
            <Trophy className="mx-auto size-14 text-primary" aria-hidden="true" />
            <h2 id="pro-welcome" className="mt-4 text-2xl font-bold text-foreground">Welcome to Pro Tier, Bro! 🏆</h2>
            <p className="mt-2 text-sm text-muted-foreground">Custom routines, swaps and advanced graphs are unlocked.</p>
            <Button type="button" onClick={() => setCelebrate(false)} className="mt-6 h-12 w-full rounded-lg font-semibold">Let's go</Button>
          </div>
        </div>
      )}
    </ProContext.Provider>
  );
}

function FeatureRow({ label, pro }: { label: string; pro: boolean }) {
  return (
    <>
      <span className="text-foreground">{label}</span>
      <span className="flex justify-center">
        {pro ? <Lock className="size-4 text-muted-foreground" aria-label="Locked" /> : <Check className="size-4 text-muted-foreground" aria-label="Included" />}
      </span>
      <span className="flex justify-center"><Check className="size-4 text-primary" aria-label="Included" /></span>
    </>
  );
}

export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;
  return (
    <div className="w-full border-b border-accent bg-accent/40 px-4 py-1.5 text-center text-xs text-accent-foreground">
      Payments in the preview are in test mode — no real money is charged.
    </div>
  );
}
