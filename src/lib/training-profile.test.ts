import { describe, expect, it } from "vitest";
import {
  checkTrainingForm,
  frequencyFromDays,
  labelFor,
  NAME_MAX,
  profileFromRow,
  restartsPlan,
  sameProfile,
  EQUIPMENT_OPTIONS,
  type TrainingForm,
  type TrainingProfile,
} from "./training-profile";

const form = (over: Partial<TrainingForm> = {}): TrainingForm => ({ name: "Ana", age: "30", frequency: "3-days", goal: "gain-muscle", equipment: "dumbbells", weightUnit: "kg", ...over });
const profile: TrainingProfile = { name: "Ana", age: 30, frequency: "3-days", goal: "gain-muscle", equipment: "dumbbells", weightUnit: "kg" };

describe("frequencyFromDays", () => {
  it("maps stored days to the three onboarding choices", () => {
    expect(frequencyFromDays(2)).toBe("2-days");
    expect(frequencyFromDays(3)).toBe("3-days");
    expect(frequencyFromDays(4)).toBe("4-plus");
    expect(frequencyFromDays(7)).toBe("4-plus");
    expect(frequencyFromDays(1)).toBe("2-days");
    expect(frequencyFromDays(null)).toBe("3-days");
  });
});

describe("profileFromRow", () => {
  const row = { full_name: "Ana", age: 30, weekly_goal_days: 3, primary_goal: "gain-muscle", equipment_type: "dumbbells" };
  it("reads a finished profile", () => {
    expect(profileFromRow(row)).toEqual(profile);
  });
  it("reads the weight unit, and falls back to kilograms for an old row or an unknown value", () => {
    expect(profileFromRow({ ...row, weight_unit: "lb" })?.weightUnit).toBe("lb");
    expect(profileFromRow({ ...row, weight_unit: "kg" })?.weightUnit).toBe("kg");
    expect(profileFromRow({ ...row, weight_unit: "stone" })?.weightUnit).toBe("kg");
    expect(profileFromRow({ ...row, weight_unit: null })?.weightUnit).toBe("kg");
  });
  it("returns null for anything missing or unknown, so a half-set-up account is never edited", () => {
    expect(profileFromRow({ ...row, equipment_type: null })).toBeNull();
    expect(profileFromRow({ ...row, full_name: null })).toBeNull();
    expect(profileFromRow({ ...row, age: null })).toBeNull();
    expect(profileFromRow({ ...row, primary_goal: "get-huge" })).toBeNull();
    expect(profileFromRow({ ...row, equipment_type: "kettlebells" })).toBeNull();
  });
});

describe("checkTrainingForm", () => {
  it("accepts a good form and trims the name", () => {
    expect(checkTrainingForm(form({ name: "  Ana Maria  ", age: " 31 " }))).toEqual({ ok: true, profile: { ...profile, name: "Ana Maria", age: 31 } });
  });
  it("points at the name when it is empty or too long", () => {
    expect(checkTrainingForm(form({ name: "   " }))).toMatchObject({ ok: false, field: "name" });
    expect(checkTrainingForm(form({ name: "x".repeat(NAME_MAX + 1) }))).toMatchObject({ ok: false, field: "name" });
    expect(checkTrainingForm(form({ name: "x".repeat(NAME_MAX) })).ok).toBe(true);
  });
  it("points at the age with the same rules as onboarding", () => {
    for (const age of ["", "9", "101", "25.5", "abc"]) expect(checkTrainingForm(form({ age })), age).toMatchObject({ ok: false, field: "age" });
    expect(checkTrainingForm(form({ age: "" }))).toMatchObject({ message: "Enter your age." });
    expect(checkTrainingForm(form({ age: "10" })).ok).toBe(true);
    expect(checkTrainingForm(form({ age: "100" })).ok).toBe(true);
  });
});

describe("comparing and restarting", () => {
  it("knows when nothing changed", () => {
    expect(sameProfile(profile, { ...profile })).toBe(true);
    expect(sameProfile(profile, { ...profile, age: 31 })).toBe(false);
    expect(sameProfile(profile, { ...profile, equipment: "barbell" })).toBe(false);
    expect(sameProfile(profile, { ...profile, weightUnit: "lb" })).toBe(false);
  });
  it("restarts the plan only when the equipment changes", () => {
    expect(restartsPlan("dumbbells", "barbell")).toBe(true);
    expect(restartsPlan("dumbbells", "dumbbells")).toBe(false);
  });
  it("finds a readable label", () => {
    expect(labelFor(EQUIPMENT_OPTIONS, "barbell")).toBe("Barbell Only");
    expect(labelFor(EQUIPMENT_OPTIONS, "unknown")).toBe("unknown");
  });
});
