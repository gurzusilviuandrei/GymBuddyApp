import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type React from "react";
import { useBackToClose } from "@/lib/back-stack";
import { Check, Lock, Trophy, X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { durableStorage } from "@/lib/durable-storage";
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

// The hook lives beside its provider on purpose; only hot reload in development is affected.
// eslint-disable-next-line react-refresh/only-export-components
export function usePro() {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error("usePro must be used inside ProProvider");
  return ctx;
}

// Last Pro status the server confirmed for this account (offline starts read it).
const PRO_CACHE_KEY = "gymbuddy-pro";

function readCachedPro(userId: string): boolean | null {
  try {
    const cached = JSON.parse(durableStorage.getItem(PRO_CACHE_KEY) ?? "null") as { userId?: string; isPro?: boolean } | null;
    return cached?.userId === userId && typeof cached.isPro === "boolean" ? cached.isPro : null;
  } catch {
    return null;
  }
}

function writeCachedPro(userId: string, isPro: boolean) {
  durableStorage.setItem(PRO_CACHE_KEY, JSON.stringify({ userId, isPro }));
}

const FEATURES:{ label: string; pro: boolean }[] = [
  { label: "Guided 3-day beginner split", pro: false },
  { label: "Set logging, rest timer & form demos", pro: false },
  { label: "Workout history & Bro Cards", pro: false },
  { label: "Custom workout editor", pro: true },
  { label: "Multi-swap when machines are busy", pro: true },
  { label: "Advanced strength analytics graphs", pro: true },
];

export function ProProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  useBackToClose(paywall, () => setPaywall(false));
  useBackToClose(celebrate, () => setCelebrate(false));
  const wasPro = useRef<boolean | null>(null);
  const proUser = useRef<string | null>(null);

  useEffect(() => {
    const sync = (u: { id: string } | null) => setUserId(u?.id ?? null);
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") sync(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) { setIsPro(false); setLoaded(false); wasPro.current = null; proUser.current = null; return; }
    if (proUser.current !== userId) {
      // A different account: its status starts unknown, never inherited.
      proUser.current = userId;
      wasPro.current = null;
      setIsPro(false);
      setLoaded(false);
    }
    // Start from the last confirmed status so Pro stays unlocked with no signal.
    if (wasPro.current === null) {
      const cached = readCachedPro(userId);
      if (cached !== null) {
        wasPro.current = cached;
        setIsPro(cached);
        setLoaded(true);
      }
    }
    const { data, error } = await supabase
      .from("users")
      .select("subscription_tier, subscription_status")
      .eq("id", userId)
      .maybeSingle();
    // No answer (offline, timeout) or the account changed meanwhile: keep what we know.
    if (error || proUser.current !== userId) return;
    const pro = data?.subscription_tier === "pro";
    if (wasPro.current === false && pro) { setPaywall(false); setCelebrate(true); }
    wasPro.current = pro;
    writeCachedPro(userId, pro);
    setIsPro(pro);
    setStatus(data?.subscription_status ?? null);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const channel = supabase
      .channel(`pro-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` }, () => void refresh())
      .subscribe();
    // Live updates can be missed (socket asleep in the background), so also
    // re-check whenever the app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("resume", onVisible);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("resume", onVisible);
    };
  }, [userId, refresh]);

  const openPaywall = useCallback(() => setPaywall(true), []);
  const requirePro = useCallback((action: () => void) => {
    if (isPro) action();
    else setPaywall(true);
  }, [isPro]);

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
            <button type="button" onClick={() => setPaywall(false)} aria-label="Close" className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
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

            {/* Store billing (Google Play / App Store) plugs in here before launch. */}
            <Button type="button" disabled className="mt-7 h-16 w-full rounded-xl text-lg font-bold">
              Pro is coming soon
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">Your data stays yours.</p>
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

