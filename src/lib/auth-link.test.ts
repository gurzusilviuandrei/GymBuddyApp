import { describe, expect, it } from "vitest";
import { parseAuthLink } from "./auth-link";

const base = "app.gymbuddyapp.gymbuddy://auth-callback";

describe("email link parsing", () => {
  it("reads a sign-in link with both tokens", () => {
    expect(parseAuthLink(`${base}/#access_token=a1&refresh_token=r1&type=signup`)).toEqual({
      kind: "session",
      accessToken: "a1",
      refreshToken: "r1",
      recovery: false,
    });
  });

  it("knows a password reset from its type or its path", () => {
    expect(parseAuthLink(`${base}/reset-password#access_token=a&refresh_token=r&type=recovery`)).toMatchObject({ kind: "session", recovery: true });
    expect(parseAuthLink(`${base}/reset-password#access_token=a&refresh_token=r`)).toMatchObject({ kind: "session", recovery: true });
  });

  it("reads a code link", () => {
    expect(parseAuthLink(`${base}/?code=abc123`)).toEqual({ kind: "code", code: "abc123", recovery: false });
  });

  it("reads the code links the sign-in client sends for each email type (PKCE)", () => {
    expect(parseAuthLink(`${base}/reset-password?code=r1`)).toEqual({ kind: "code", code: "r1", recovery: true });
    expect(parseAuthLink(`${base}/auth?code=s1`)).toEqual({ kind: "code", code: "s1", recovery: false });
    expect(parseAuthLink(`${base}/?code=e1`)).toEqual({ kind: "code", code: "e1", recovery: false });
  });

  it("reports a failed code link (expired or already used) as invalid", () => {
    expect(parseAuthLink(`${base}/reset-password?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)).toEqual({ kind: "invalid" });
  });

  it("reports a failure the server put in the link", () => {
    expect(parseAuthLink(`${base}/#error=access_denied&error_description=Email+link+is+invalid+or+has+expired`)).toEqual({ kind: "invalid" });
    expect(parseAuthLink(`${base}/?error_description=expired`)).toEqual({ kind: "invalid" });
  });

  it("passes on a plain message from the server (one of two change-email confirmations)", () => {
    expect(parseAuthLink(`${base}/#message=Confirmation+link+accepted.+Please+proceed+to+confirm+the+other+email`)).toEqual({
      kind: "notice",
      text: "Confirmation link accepted. Please proceed to confirm the other email",
    });
  });

  it("calls a cut-off or empty link invalid instead of ignoring it", () => {
    expect(parseAuthLink(`${base}/#access_token=a1`)).toEqual({ kind: "invalid" });
    expect(parseAuthLink(`${base}/#refresh_token=r1`)).toEqual({ kind: "invalid" });
    expect(parseAuthLink(`${base}/`)).toEqual({ kind: "invalid" });
  });

  it("ignores links that are not ours", () => {
    expect(parseAuthLink("https://example.com/auth-callback#access_token=a&refresh_token=r")).toEqual({ kind: "ignore" });
    expect(parseAuthLink("app.gymbuddyapp.gymbuddy://other/#access_token=a&refresh_token=r")).toEqual({ kind: "ignore" });
    expect(parseAuthLink("not a url")).toEqual({ kind: "ignore" });
  });
});
