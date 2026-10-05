import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const SECURITY_NOTICE_KEY = "gymbuddy-security-notice";
export const SECURITY_NOTICE = "Security update detected. Please re-authenticate.";

/**
 * Re-validates the session with the auth server at start-up and whenever the app
 * returns to the foreground (no polling, to spare battery and data). When a
 * password change on another device revoked this session, the check fails and
 * this phone is signed out and sent to the login screen.
 */
export function SessionGuard() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const { error } = await supabase.auth.getUser();
        const status = (error as { status?: number } | null)?.status;
        if (error && (status === 401 || status === 403 || /session/i.test(error.message))) {
          sessionStorage.setItem(SECURITY_NOTICE_KEY, "1");
          await queryClient.cancelQueries();
          queryClient.clear();
          await supabase.auth.signOut({ scope: "local" });
          router.navigate({ to: "/auth", replace: true });
        }
      } finally {
        checking = false;
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router, queryClient]);

  return null;
}
