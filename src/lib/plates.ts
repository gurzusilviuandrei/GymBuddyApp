// Plate maths for a barbell: which plates go on each side for a total weight. Works in the
// member's own unit (the standard Olympic bar is 20 kg or 45 lb, and gyms stock different
// plates in each). Free of React so it is unit-tested in plates.test.ts.
import type { WeightUnit } from "./weight-units";

export type PlateSet = {
  bar: number;
  /** Heaviest first. */
  plates: readonly number[];
  /** What a total is rounded to when it can't be matched exactly. */
  roundTo: number;
};

export const PLATE_SETS: Record<WeightUnit, PlateSet> = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], roundTo: 2.5 },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5], roundTo: 5 },
};

export type PlateLoad = {
  /** Plates for ONE side of the bar, heaviest first. */
  plates: number[];
  /** What is left over in total (both sides) that no standard plate can make. */
  leftover: number;
};

export function platesPerSide(total: number, unit: WeightUnit): PlateLoad {
  const { bar, plates } = PLATE_SETS[unit];
  let side = (total - bar) / 2;
  const out: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      out.push(p);
      side -= p;
    }
  }
  return { plates: out, leftover: Math.round(side * 2 * 100) / 100 };
}

/** The lightest weight worth showing plates for: the empty bar. */
export function barWeight(unit: WeightUnit): number {
  return PLATE_SETS[unit].bar;
}

/** Warm-up weights are rounded to something a plate set can make. */
export function roundToPlates(weight: number, unit: WeightUnit): number {
  const step = PLATE_SETS[unit].roundTo;
  return Math.round(weight / step) * step;
}
