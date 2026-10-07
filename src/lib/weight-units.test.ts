import { describe, expect, it } from "vitest";
import {
  defaultUnitForLocale,
  broCardVolume,
  formatVolume,
  formatWeight,
  isWeightUnit,
  kgToUnit,
  maxWeightInUnit,
  unitToKg,
  volumeInUnit,
  weightStep,
  weightStepKg,
} from "./weight-units";

describe("converting weights", () => {
  it("shows kilograms as stored", () => {
    expect(kgToUnit(22.5, "kg")).toBe(22.5);
    expect(kgToUnit(100, "kg")).toBe(100);
    expect(unitToKg(22.5, "kg")).toBe(22.5);
  });

  it("converts well-known weights to pounds", () => {
    expect(kgToUnit(20, "lb")).toBe(44.1);
    expect(kgToUnit(100, "lb")).toBe(220.5);
    expect(kgToUnit(45.359237, "lb")).toBe(100);
    expect(unitToKg(100, "lb")).toBe(45.36);
    expect(unitToKg(45, "lb")).toBe(20.41);
  });

  it("brings a pound weight back exactly as typed (never 134.99)", () => {
    for (let tenths = 0; tenths <= 22040; tenths += 1) {
      const pounds = tenths / 10;
      expect(kgToUnit(unitToKg(pounds, "lb"), "lb"), String(pounds)).toBe(pounds);
    }
  });

  it("keeps stored kilograms to the database's two decimals", () => {
    for (const pounds of [135, 187.5, 225, 315, 1, 0.5]) {
      const kg = unitToKg(pounds, "lb");
      expect(Math.round(kg * 100) / 100).toBe(kg);
    }
  });

  it("handles zero (bodyweight) in both units", () => {
    expect(kgToUnit(0, "lb")).toBe(0);
    expect(unitToKg(0, "lb")).toBe(0);
    expect(formatWeight(0, "lb")).toBe("0 lb");
  });
});

describe("showing weights", () => {
  it("writes the number and the unit, without trailing zeros", () => {
    expect(formatWeight(22.5, "kg")).toBe("22.5 kg");
    expect(formatWeight(40, "kg")).toBe("40 kg");
    expect(formatWeight(unitToKg(135, "lb"), "lb")).toBe("135 lb");
    expect(formatWeight(unitToKg(187.5, "lb"), "lb")).toBe("187.5 lb");
  });

  it("rounds a workout's total volume to a whole number", () => {
    expect(volumeInUnit(2400, "kg")).toBe(2400);
    expect(volumeInUnit(2400, "lb")).toBe(5291);
    expect(formatVolume(202.5, "kg")).toBe("203 kg");
    expect(formatVolume(1000, "lb")).toBe("2205 lb");
    expect(formatVolume(0, "lb")).toBe("0 lb");
  });
});

describe("the Bro Card volume", () => {
  it("captions and counts in the member's unit", () => {
    expect(broCardVolume(2400, "kg")).toEqual({ label: "KG SHIFTED", value: "2,400" });
    expect(broCardVolume(2400, "lb")).toEqual({ label: "LB SHIFTED", value: "5,291" });
    expect(broCardVolume(0, "lb")).toEqual({ label: "LB SHIFTED", value: "0" });
  });
});

describe("steps and limits", () => {
  it("steps 2.5 kg or 5 lb, and the lb step in kilograms for the step-up suggestion", () => {
    expect(weightStep("kg")).toBe(2.5);
    expect(weightStep("lb")).toBe(5);
    expect(weightStepKg("kg")).toBe(2.5);
    expect(weightStepKg("lb")).toBe(2.27);
  });

  it("allows up to the database limit of 1000 kg, in either unit", () => {
    expect(maxWeightInUnit("kg")).toBe(1000);
    expect(maxWeightInUnit("lb")).toBe(2204);
    expect(unitToKg(maxWeightInUnit("lb"), "lb")).toBeLessThanOrEqual(1000);
    expect(unitToKg(2205, "lb")).toBeGreaterThan(1000);
  });
});

describe("the default unit for a phone's language and region", () => {
  it("uses pounds where pounds are the norm", () => {
    for (const l of ["en-US", "en_US", "es-US", "en-LR", "my-MM"]) expect(defaultUnitForLocale(l), l).toBe("lb");
  });
  it("uses kilograms everywhere else, and when it cannot tell", () => {
    for (const l of ["en-GB", "ro-RO", "de-DE", "en", "", undefined, null, "en-AU", "pt-BR"]) expect(defaultUnitForLocale(l), String(l)).toBe("kg");
  });
  it("recognises the two unit names", () => {
    expect(isWeightUnit("kg")).toBe(true);
    expect(isWeightUnit("lb")).toBe(true);
    expect(isWeightUnit("lbs")).toBe(false);
    expect(isWeightUnit(undefined)).toBe(false);
  });
});
