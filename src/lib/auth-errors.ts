// Member-facing text for failed auth requests (login, sign-up, password reset,
// confirmation email), kept free of React so every rule is unit-tested in
// auth-errors.test.ts.

type AuthLikeError = { name?: string; status?: number; code?: string; message?: string } | null | undefined;

export const OFFLINE_MESSAGE = "No connection. Check your signal and try again.";

/** How long to wait before asking for another confirmation email. */
export const RESEND_COOLDOWN_MS = 60_000;

/** The request never reached the server (no signal, DNS, airplane mode…). */
export function isNetworkError(error: unknown): boolean {
  const e = error as AuthLikeError;
  if (!e) return false;
  return (
    e.name === "AuthRetryableFetchError" ||
    e.status === 0 ||
    /failed to fetch|load failed|network ?error|network request failed|fetch failed/i.test(e.message ?? "")
  );
}

/** Login refused because the sign-up email link hasn't been tapped yet. */
export function isEmailNotConfirmed(error: unknown): boolean {
  const e = error as AuthLikeError;
  return e?.code === "email_not_confirmed" || /email not confirmed/i.test(e?.message ?? "");
}

/** Sign-up refused outright because the email already has an account. */
export function isAlreadyRegistered(error: unknown): boolean {
  const e = error as AuthLikeError;
  return e?.code === "user_already_exists" || /already (been )?registered|already exists/i.test(e?.message ?? "");
}

/**
 * With email confirmation on, signing up an address that already has an account
 * does not fail: the server returns a look-alike user with no identities (so
 * strangers can't probe which emails exist). Real new users always have one.
 */
export function isFakeSignUp(identities: unknown[] | null | undefined): boolean {
  return Array.isArray(identities) && identities.length === 0;
}

/** Whole seconds left on a cooldown ending at `until` (0 once it has passed). */
export function cooldownSecondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Text for a failed login / sign-up: friendly offline wording, else the server's own. */
export function friendlyAuthError(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE;
  const message = (error as AuthLikeError)?.message?.trim();
  return message || fallback;
}

/**
 * Text for a failed email request (password reset, confirmation). The auth server
 * refuses a second email to the same account within about a minute, and says how
 * long to wait: show that instead of "try again".
 */
export function emailSendError(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE;
  const e = error as AuthLikeError;
  const message = e?.message ?? "";
  // e.g. "For security purposes, you can only request this after 42 seconds."
  const seconds = message.match(/after (\d+) seconds?/i)?.[1];
  if (seconds) return `For security, you can request another email in ${seconds} ${seconds === "1" ? "second" : "seconds"}.`;
  if (e?.status === 429 || e?.code === "over_email_send_rate_limit" || /rate limit/i.test(message)) {
    return "Too many emails were sent just now. Wait a few minutes and try again.";
  }
  return fallback;
}
