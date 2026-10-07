// Telling "the server said no" apart from "no signal". A set that failed for lack of
// signal is retried later; one the database refuses (a value it will never accept)
// must not be retried forever, or the badge says "Syncing…" until the member gives up.

/** Thrown by the data layer when the database rejected the request itself. */
export class ServerRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerRefusedError";
  }
}

/**
 * Postgres error codes that mean "this data is wrong, retrying cannot help": class 22
 * (data exception, e.g. out of range), class 23 (integrity or check violation) and
 * P0001 (an exception raised by our own functions, e.g. a validation message).
 * A network failure carries no code at all, and auth problems (PGRST…, 42501) are
 * fixed by signing in again, so those stay retryable.
 */
export function isRefusalCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code === "P0001" || code.startsWith("22") || code.startsWith("23");
}

export function isServerRefusal(error: unknown): error is ServerRefusedError {
  return error instanceof ServerRefusedError;
}
