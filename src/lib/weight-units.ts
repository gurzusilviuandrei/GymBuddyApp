// Weights are always stored in kilograms (database, saved workouts, the offline queue).
// A member who prefers pounds only sees and types pounds: everything converts at the edges
// with the helpers here, so no stored number ever changes. Free of React and storage, so it
// is unit-tested in weight-units.test.ts.

export type WeightUnit = "kg" | "lb";

export const WEIGHT_UNITS: readonly { id: WeightUnit; label: string }[] = [
  { id: "kg", label: "Kilograms (kg)" },
  { id: "lb", label: "Pounds (lb)" },
];

/** The international definition: exactly 0.45359237 kg. */
export const KG_PER_LB = 0.45359237;

/** The database's limit for one set. */
export const MAX_SET_WEIGHT_KG = 1000;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "kg" || value === "lb";
}

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/**
 * A stored weight (kg) as the number to show: whole-and-half kilos as stored, pounds to one
 * decimal. The kg column holds two decimals, so a pound weight typed as 135 comes back as
 * 135 (and never 134.99).
 */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? round(kg, 2) : round(kg / KG_PER_LB, 1);
}

/** A number typed in the member's unit, as the kilograms to store (two decimals, like the column). */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === "kg" ? round(value, 2) : round(value * KG_PER_LB, 2);
}

/** "22.5 kg" or "50 lb"; no trailing zeros. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${kgToUnit(kg, unit)} ${unit}`;
}

/** Total volume: a whole number in the member's unit. */
export function volumeInUnit(kg: number, unit: WeightUnit): number {
  return Math.round(unit === "kg" ? kg : kg / KG_PER_LB);
}

export function formatVolume(kg: number, unit: WeightUnit): string {
  return `${volumeInUnit(kg, unit)} ${unit}`;
}

/** The big number on the shareable Bro Card: its caption and the total (thousands separated by commas). */
export function broCardVolume(kg: number, unit: WeightUnit): { label: string; value: string } {
  return { label: `${unit.toUpperCase()} SHIFTED`, value: volumeInUnit(kg, unit).toLocaleString("en-US") };
}

/** How far the +/- buttons move a weight, in the member's unit. */
export function weightStep(unit: WeightUnit): number {
  return unit === "kg" ? 2.5 : 5;
}

/** The same step in kilograms (the step-up suggestion works in kg). */
export function weightStepKg(unit: WeightUnit): number {
  return unitToKg(weightStep(unit), unit);
}

/** The most the +/- buttons and the plate maths go to, in the member's unit. */
export function maxWeightInUnit(unit: WeightUnit): number {
  return Math.floor(kgToUnit(MAX_SET_WEIGHT_KG, unit));
}

/** Pounds for the United States, Liberia and Myanmar; kilograms everywhere else. */
export function defaultUnitForLocale(locale: string | null | undefined): WeightUnit {
  const region = /[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(locale ?? "")?.[1]?.toUpperCase();
  return region === "US" || region === "LR" || region === "MM" ? "lb" : "kg";
}
