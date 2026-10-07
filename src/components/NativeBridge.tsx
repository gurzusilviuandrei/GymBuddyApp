import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/platform";
import { runBackHandler } from "@/lib/back-stack";
import { INVALID_LINK_MESSAGE, parseAuthLink } from "@/lib/auth-link";

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
      const link = parseAuthLink(url);
      if (link.kind === "ignore") return;
      if (link.kind === "invalid") {
        toast.error(INVALID_LINK_MESSAGE);
        return;
      }
      if (link.kind === "notice") {
        toast.success(link.text);
        await router.navigate({ to: "/", replace: true });
        return;
      }
      // setSession throws (instead of returning an error) for a damaged token.
      try {
        const { error } = link.kind === "session"
          ? await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
          : await supabase.auth.exchangeCodeForSession(link.code);
        if (error) throw error;
      } catch {
        toast.error(INVALID_LINK_MESSAGE);
        return;
      }
      if (link.recovery) await router.navigate({ to: "/reset-password", hash: "type=recovery", replace: true });
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
