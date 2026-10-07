import { describe, expect, it } from "vitest";
import { isRefusalCode, isServerRefusal, ServerRefusedError } from "./server-refusal";

describe("which server errors are final", () => {
  it("treats data and integrity errors, and our own raised exceptions, as refusals", () => {
    for (const code of ["22003", "22P02", "23514", "23503", "23505", "P0001"]) expect(isRefusalCode(code)).toBe(true);
  });

  it("keeps no-signal and sign-in problems retryable", () => {
    for (const code of ["", null, undefined, "PGRST301", "PGRST303", "42501", "57014", "08006", "53300"]) expect(isRefusalCode(code)).toBe(false);
  });

  it("recognises its own error type only", () => {
    expect(isServerRefusal(new ServerRefusedError("no"))).toBe(true);
    expect(isServerRefusal(new Error("timeout"))).toBe(false);
    expect(isServerRefusal("22003")).toBe(false);
  });
});
