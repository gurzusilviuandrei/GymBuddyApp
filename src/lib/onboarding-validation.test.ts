import { describe, expect, it } from "vitest";
import { checkAge } from "./onboarding-validation";

const WHOLE = "Enter your age as a whole number, like 25.";
const RANGE = "Age must be between 10 and 100.";

describe("onboarding age", () => {
  it("accepts whole numbers from 10 to 100", () => {
    expect(checkAge("25")).toEqual({ ok: true, age: 25 });
    expect(checkAge("10")).toEqual({ ok: true, age: 10 });
    expect(checkAge("100")).toEqual({ ok: true, age: 100 });
    expect(checkAge(" 42 ")).toEqual({ ok: true, age: 42 });
  });

  it("refuses a decimal age with a message that says why (the database only stores whole numbers)", () => {
    for (const typed of ["15.5", "25.0", "30,5", "1e1", "2.5e1", "abc", "12a", "--5"]) {
      expect(checkAge(typed), typed).toEqual({ ok: false, message: WHOLE });
    }
  });

  it("refuses ages outside the allowed range", () => {
    for (const typed of ["9", "0", "101", "250", "-5"]) {
      expect(checkAge(typed), typed).toEqual({ ok: false, message: RANGE });
    }
  });

  it("does not complain about an empty box, but does not accept it either", () => {
    expect(checkAge("")).toEqual({ ok: false, message: null });
    expect(checkAge("   ")).toEqual({ ok: false, message: null });
  });
});
