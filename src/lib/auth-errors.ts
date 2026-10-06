// Member-facing text for a failed auth email request (password reset, sign-up
// confirmation). The auth server refuses a second email to the same account within
// about a minute, and says how long to wait: show that instead of "try again".

type AuthLikeError = { status?: number; code?: string; message?: string } | null | undefined;

export function emailSendError(error: unknown, fallback: string): string {
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
