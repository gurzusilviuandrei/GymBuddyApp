import { describe, expect, it } from "vitest";
import { emailSendError } from "./auth-errors";

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

  it("falls back for anything else", () => {
    expect(emailSendError(new Error("Failed to fetch"), fallback)).toBe(fallback);
    expect(emailSendError(null, fallback)).toBe(fallback);
  });
});
