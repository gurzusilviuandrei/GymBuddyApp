import { describe, expect, it } from "vitest";
import {
  cooldownSecondsLeft,
  emailSendError,
  EMAIL_SEND_FAILED_MESSAGE,
  friendlyAuthError,
  isServerError,
  SERVER_PROBLEM_MESSAGE,
  isAlreadyRegistered,
  isEmailNotConfirmed,
  isFakeSignUp,
  isNetworkError,
  OFFLINE_MESSAGE,
  RESEND_COOLDOWN_MS,
} from "./auth-errors";

const fallback = "Couldn't send the email. Try again.";

describe("emailSendError", () => {
  it("tells the member how long to wait after a recent email", () => {
    const err = { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." };
    expect(emailSendError(err, fallback)).toBe("For security, you can request another email in 42 seconds.");
    expect(emailSendError({ message: "...only request this after 1 second." }, fallback)).toMatch(/in 1 second\.$/);
  });

  it("explains a general sending limit", () => {
    expect(emailSendError({ status: 429, message: "Email rate limit exceeded" }, fallback)).toMatch(/Wait a few minutes/);
  });

  it("says there is no connection instead of a generic failure", () => {
    expect(emailSendError(new TypeError("Failed to fetch"), fallback)).toBe(OFFLINE_MESSAGE);
  });

  it("falls back for anything else", () => {
    expect(emailSendError(new Error("boom"), fallback)).toBe(fallback);
    expect(emailSendError(null, fallback)).toBe(fallback);
  });
});

describe("email not confirmed (login)", () => {
  it("recognises the server's refusal by code or by message", () => {
    expect(isEmailNotConfirmed({ code: "email_not_confirmed", message: "x" })).toBe(true);
    expect(isEmailNotConfirmed({ message: "Email not confirmed" })).toBe(true);
    expect(isEmailNotConfirmed(new Error("email NOT confirmed"))).toBe(true);
  });

  it("does not mistake other login failures for it", () => {
    expect(isEmailNotConfirmed({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
    expect(isEmailNotConfirmed(null)).toBe(false);
  });
});

describe("resend cooldown", () => {
  it("counts down whole seconds and stops at zero", () => {
    const sentAt = 1_000_000;
    const until = sentAt + RESEND_COOLDOWN_MS;
    expect(cooldownSecondsLeft(until, sentAt)).toBe(60);
    expect(cooldownSecondsLeft(until, sentAt + 59_001)).toBe(1);
    expect(cooldownSecondsLeft(until, until)).toBe(0);
    expect(cooldownSecondsLeft(until, until + 5_000)).toBe(0);
  });
});

describe("server errors are not 'no connection'", () => {
  // Found on 2026-10-09: the sign-up email could not be sent (500), and the app said "No connection".
  const emailFailure = { name: "AuthRetryableFetchError", status: 500, message: "Error sending confirmation email" };

  it("tells the member the email could not be sent, not that they are offline", () => {
    expect(isNetworkError(emailFailure)).toBe(false);
    expect(isServerError(emailFailure)).toBe(true);
    expect(friendlyAuthError(emailFailure)).toBe(EMAIL_SEND_FAILED_MESSAGE);
    expect(emailSendError(emailFailure, "Couldn't resend the email. Check your signal and try again.")).toBe(EMAIL_SEND_FAILED_MESSAGE);
    expect(friendlyAuthError({ ...emailFailure, message: "Error sending recovery email" })).toBe(EMAIL_SEND_FAILED_MESSAGE);
  });

  it("says the server had a problem for other server errors", () => {
    for (const status of [500, 502, 503, 504, 522]) {
      const err = { name: "AuthRetryableFetchError", status, message: "HTTP " + status };
      expect(isNetworkError(err), String(status)).toBe(false);
      expect(friendlyAuthError(err), String(status)).toBe(SERVER_PROBLEM_MESSAGE);
    }
  });

  it("still treats a 4xx refusal as the server's own message", () => {
    expect(isServerError({ status: 422, message: "x" })).toBe(false);
    expect(isServerError({ status: 0 })).toBe(false);
    expect(isServerError(null)).toBe(false);
  });
});

describe("offline wording", () => {
  it("shows a friendly message for every way a request can fail to leave the phone", () => {
    for (const err of [
      new TypeError("Failed to fetch"),
      new TypeError("Load failed"),
      new TypeError("NetworkError when attempting to fetch resource."),
      { name: "AuthRetryableFetchError", message: "x", status: 0 },
      { status: 0, message: "" },
    ]) {
      expect(isNetworkError(err), JSON.stringify(err)).toBe(true);
      expect(friendlyAuthError(err)).toBe(OFFLINE_MESSAGE);
    }
  });

  it("keeps the server's own text for real refusals", () => {
    expect(isNetworkError({ status: 400, message: "Password should be at least 8 characters." })).toBe(false);
    expect(friendlyAuthError({ message: "Password should be at least 8 characters." })).toBe("Password should be at least 8 characters.");
    expect(friendlyAuthError({}, "Try again.")).toBe("Try again.");
    expect(friendlyAuthError(null)).toBe("Something went wrong. Try again.");
  });
});

describe("sign-up with an email that already has an account", () => {
  it("spots the look-alike user the server returns when confirmation is on", () => {
    expect(isFakeSignUp([])).toBe(true);
    expect(isFakeSignUp([{ id: "x" }])).toBe(false);
    expect(isFakeSignUp(undefined)).toBe(false);
    expect(isFakeSignUp(null)).toBe(false);
  });

  it("spots the explicit refusal when confirmation is off", () => {
    expect(isAlreadyRegistered({ code: "user_already_exists", message: "x" })).toBe(true);
    expect(isAlreadyRegistered({ message: "User already registered" })).toBe(true);
    expect(isAlreadyRegistered({ message: "Password should be at least 8 characters." })).toBe(false);
    expect(isAlreadyRegistered(null)).toBe(false);
  });
});
