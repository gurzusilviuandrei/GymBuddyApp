import { describe, expect, it } from "vitest";
import { barWeight, PLATE_SETS, platesPerSide, roundToPlates } from "./plates";

describe("plates in kilograms", () => {
  it("loads the usual weights", () => {
    expect(platesPerSide(20, "kg")).toEqual({ plates: [], leftover: 0 });
    expect(platesPerSide(60, "kg")).toEqual({ plates: [20], leftover: 0 });
    expect(platesPerSide(100, "kg")).toEqual({ plates: [25, 15], leftover: 0 });
    expect(platesPerSide(102.5, "kg")).toEqual({ plates: [25, 15, 1.25], leftover: 0 });
  });
  it("reports what the plates cannot make", () => {
    expect(platesPerSide(21, "kg")).toEqual({ plates: [], leftover: 1 });
  });
});

describe("plates in pounds (45 lb bar)", () => {
  it("starts from the 45 lb bar", () => {
    expect(barWeight("lb")).toBe(45);
    expect(barWeight("kg")).toBe(20);
    expect(platesPerSide(45, "lb")).toEqual({ plates: [], leftover: 0 });
  });
  it("loads the classic gym weights", () => {
    expect(platesPerSide(135, "lb")).toEqual({ plates: [45], leftover: 0 });
    expect(platesPerSide(185, "lb")).toEqual({ plates: [45, 25], leftover: 0 });
    expect(platesPerSide(225, "lb")).toEqual({ plates: [45, 45], leftover: 0 });
    expect(platesPerSide(315, "lb")).toEqual({ plates: [45, 45, 45], leftover: 0 });
    expect(platesPerSide(95, "lb")).toEqual({ plates: [25], leftover: 0 });
    expect(platesPerSide(50, "lb")).toEqual({ plates: [2.5], leftover: 0 });
  });
  it("uses the smallest plates for the odd weights and reports what is left", () => {
    expect(platesPerSide(100, "lb")).toEqual({ plates: [25, 2.5], leftover: 0 });
    expect(platesPerSide(46, "lb")).toEqual({ plates: [], leftover: 1 });
  });
  it("always adds up: bar + two sleeves + leftover is the total", () => {
    for (let total = 45; total <= 600; total += 2.5) {
      const { plates, leftover } = platesPerSide(total, "lb");
      const sum = PLATE_SETS.lb.bar + 2 * plates.reduce((a, b) => a + b, 0) + leftover;
      expect(Math.abs(sum - total), String(total)).toBeLessThan(1e-6);
    }
  });
});

describe("rounding warm-up weights", () => {
  it("rounds to 2.5 kg or 5 lb", () => {
    expect(roundToPlates(31, "kg")).toBe(30);
    expect(roundToPlates(31.5, "kg")).toBe(32.5);
    expect(roundToPlates(31, "lb")).toBe(30);
    expect(roundToPlates(112.5, "lb")).toBe(115);
    expect(roundToPlates(0, "lb")).toBe(0);
  });
});
