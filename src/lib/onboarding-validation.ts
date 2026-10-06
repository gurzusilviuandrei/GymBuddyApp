// Rules for the onboarding form, free of React so they are unit-tested in
// onboarding-validation.test.ts. The database stores age as a whole number from
// 10 to 100, so anything else must be refused here with a message that says why
// (a decimal age otherwise failed at the very last step with a vague error).

export const MIN_AGE = 10;
export const MAX_AGE = 100;

export type AgeCheck =
  | { ok: true; age: number }
  /** `message` is null while nothing has been typed yet (no complaint on an empty box). */
  | { ok: false; message: string | null };

export function checkAge(text: string): AgeCheck {
  const typed = text.trim();
  if (typed === "") return { ok: false, message: null };
  if (!/^[+-]?\d+$/.test(typed)) return { ok: false, message: "Enter your age as a whole number, like 25." };
  const age = Number(typed);
  if (age < MIN_AGE || age > MAX_AGE) return { ok: false, message: `Age must be between ${MIN_AGE} and ${MAX_AGE}.` };
  return { ok: true, age };
}
