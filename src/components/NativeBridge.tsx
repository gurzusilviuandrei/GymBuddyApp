import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/platform";
import { runBackHandler } from "@/lib/back-stack";

// Screens where Android Back leaves the app instead of walking back through history.
// Onboarding is always opened in place of the previous screen: minimizing keeps the
// answers in progress, where going "back" to the start screen would restart it.
const EXIT_ROUTES = new Set(["/", "/auth", "/home", "/onboarding"]);

/** Native-only glue: auth email deep links and the Android Back button. */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp) return;

    const urlListener = App.addListener("appUrlOpen", async ({ url }) => {
      // e.g. app.gymbuddyapp.gymbuddy://auth-callback/reset-password#access_token=…&type=recovery
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.host !== "auth-callback") return;
      const hash = new URLSearchParams(parsed.hash.slice(1));
      const query = parsed.searchParams;
      const errorText = hash.get("error_description") ?? query.get("error_description");
      if (errorText) {
        toast.error("That link is invalid or has expired.");
        return;
      }
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      const { error } = accessToken && refreshToken
        ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : code
          ? await supabase.auth.exchangeCodeForSession(code)
          : { error: null };
      if (error) {
        toast.error("That link is invalid or has expired.");
        return;
      }
      const recovery = hash.get("type") === "recovery" || parsed.pathname === "/reset-password";
      if (recovery) await router.navigate({ to: "/reset-password", hash: "type=recovery", replace: true });
      else await router.navigate({ to: "/", replace: true });
    });

    const backListener = App.addListener("backButton", () => {
      // An open dialog closes first (and keeps the member's data); only then does Back navigate.
      if (runBackHandler()) return;
      const path = router.state.location.pathname;
      if (EXIT_ROUTES.has(path)) void App.minimizeApp();
      else if (router.history.canGoBack()) window.history.back();
      // Opened straight from a link (e.g. password reset): nothing to go back to,
      // so go to the start screen, which sends signed-in members Home.
      else void router.navigate({ to: "/", replace: true });
    });

    return () => {
      void urlListener.then((l) => l.remove());
      void backListener.then((l) => l.remove());
    };
  }, [router]);

  return null;
}
