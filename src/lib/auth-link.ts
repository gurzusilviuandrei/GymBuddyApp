// What an email link (confirm sign-up, reset password, change email) asks the app to do.
// Kept free of the Supabase client so the rules can be tested; NativeBridge acts on it.

export const INVALID_LINK_MESSAGE = "That link is invalid or has expired.";

export type AuthLink =
  /** Not one of ours (other host, not a URL): do nothing. */
  | { kind: "ignore" }
  /** The server said the link failed, or it is cut off or has nothing usable. */
  | { kind: "invalid" }
  /** The server only wants to tell the member something (e.g. one of two change-email confirmations done). */
  | { kind: "notice"; text: string }
  | { kind: "session"; accessToken: string; refreshToken: string; recovery: boolean }
  | { kind: "code"; code: string; recovery: boolean };

/** e.g. app.gymbuddyapp.gymbuddy://auth-callback/reset-password#access_token=…&refresh_token=…&type=recovery */
export function parseAuthLink(url: string): AuthLink {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "ignore" };
  }
  if (parsed.host !== "auth-callback") return { kind: "ignore" };

  const hash = new URLSearchParams(parsed.hash.slice(1));
  const query = parsed.searchParams;
  if (hash.get("error_description") ?? query.get("error_description")) return { kind: "invalid" };

  const recovery = hash.get("type") === "recovery" || parsed.pathname === "/reset-password";
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const code = query.get("code");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken, recovery };
  if (code) return { kind: "code", code, recovery };
  const notice = hash.get("message") ?? query.get("message");
  if (notice) return { kind: "notice", text: notice.slice(0, 200) };
  // A link an email app cut off (a token without its partner) or an empty one: say so
  // instead of opening the app as if nothing had been asked.
  return { kind: "invalid" };
}
