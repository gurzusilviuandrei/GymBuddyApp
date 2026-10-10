import { describe, expect, it } from "vitest";
import { OFFLINE_MESSAGE } from "./auth-errors";
import { cleanCode, codeError, isCompleteCode, WRONG_CODE_MESSAGE } from "./confirm-code";

describe("the confirmation code box", () => {
  it("keeps digits only, even from pasted text", () => {
    expect(cleanCode("123456")).toBe("123456");
    expect(cleanCode("123 456")).toBe("123456");
    expect(cleanCode("Your code: 123-456.")).toBe("123456");
    expect(cleanCode("abc")).toBe("");
  });

  it("never holds more than 10 digits", () => {
    expect(cleanCode("12345678901234")).toBe("1234567890");
  });

  it("is ready to send at 6 to 10 digits", () => {
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345678")).toBe(true);
    expect(isCompleteCode("1234567890")).toBe(true);
    expect(isCompleteCode("12345678901")).toBe(false);
    expect(isCompleteCode("12345a")).toBe(false);
    expect(isCompleteCode("")).toBe(false);
  });
});

describe("a refused code", () => {
  it("says wrong or expired for the server's refusal", () => {
    expect(codeError({ status: 403, code: "otp_expired", message: "Token has expired or is invalid" })).toBe(WRONG_CODE_MESSAGE);
    expect(codeError({ message: "" })).toBe(WRONG_CODE_MESSAGE);
    expect(codeError(null)).toBe(WRONG_CODE_MESSAGE);
  });

  it("says no connection when the request never left the phone", () => {
    expect(codeError(new TypeError("Failed to fetch"))).toBe(OFFLINE_MESSAGE);
  });

  it("asks to wait when there were too many tries", () => {
    expect(codeError({ status: 429, message: "For security purposes, you can only request this after 30 seconds." })).toBe("Too many tries. Wait 30 seconds and try again.");
    expect(codeError({ status: 429, message: "Rate limit exceeded" })).toBe("Too many tries. Wait a minute and try again.");
  });
});
