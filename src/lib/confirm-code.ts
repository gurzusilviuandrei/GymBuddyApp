// The sign-up confirmation code: the email carries a one-time code (6 digits by default, the
// length is a Supabase setting between 6 and 10) that the member types into the app. Unlike the
// link, it works whichever device the email is read on, and link checkers in mail apps can't
// use it up. Kept free of React and the Supabase client so the rules are unit-tested.
import { isNetworkError, OFFLINE_MESSAGE } from "./auth-errors";

export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 10;

export const WRONG_CODE_MESSAGE = "That code is wrong or has expired. Check the newest email, or send a new code.";

/** Digits only, at most CODE_MAX_LENGTH: pasted text like "123 456" or "Code: 123456" becomes "123456". */
export function cleanCode(text: string): string {
  return text.replace(/\D/g, "").slice(0, CODE_MAX_LENGTH);
}

/** Long enough to send to the server. */
export function isCompleteCode(code: string): boolean {
  return /^\d+$/.test(code) && code.length >= CODE_MIN_LENGTH && code.length <= CODE_MAX_LENGTH;
}

type AuthLikeError = { name?: string; status?: number; code?: string; message?: string } | null | undefined;

/** Text for a refused code. */
export function codeError(error: unknown): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE;
  const e = error as AuthLikeError;
  const message = e?.message ?? "";
  const seconds = message.match(/after (\d+) seconds?/i)?.[1];
  if (seconds) return `Too many tries. Wait ${seconds} ${seconds === "1" ? "second" : "seconds"} and try again.`;
  if (e?.status === 429 || /rate limit/i.test(message)) return "Too many tries. Wait a minute and try again.";
  return WRONG_CODE_MESSAGE;
}
