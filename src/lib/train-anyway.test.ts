import { describe, expect, it } from "vitest";
import { readTrainAnywayToday, rememberTrainAnywayToday, TRAIN_ANYWAY_KEY } from "./train-anyway";

function fakeStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

const day = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h);

describe("remembering 'Train anyway' for the day", () => {
  it("is off until the member chooses it", () => {
    expect(readTrainAnywayToday(day(2026, 9, 7), fakeStore())).toBe(false);
  });

  it("stays on for the rest of the same calendar day, including late evening", () => {
    const store = fakeStore();
    rememberTrainAnywayToday(day(2026, 9, 7, 8), store);
    expect(readTrainAnywayToday(day(2026, 9, 7, 8), store)).toBe(true);
    expect(readTrainAnywayToday(day(2026, 9, 7, 23), store)).toBe(true);
  });

  it("ends at midnight: the next day Rest & Recovery returns", () => {
    const store = fakeStore();
    rememberTrainAnywayToday(day(2026, 9, 7, 23), store);
    expect(readTrainAnywayToday(day(2026, 9, 8, 0), store)).toBe(false);
  });

  it("ignores junk in storage and survives storage that throws or is missing", () => {
    expect(readTrainAnywayToday(day(2026, 9, 7), fakeStore({ [TRAIN_ANYWAY_KEY]: "true" }))).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTrainAnywayToday(day(2026, 9, 7), broken)).toBe(false);
    expect(() => rememberTrainAnywayToday(day(2026, 9, 7), broken)).not.toThrow();
    expect(readTrainAnywayToday(day(2026, 9, 7), null)).toBe(false);
    expect(() => rememberTrainAnywayToday(day(2026, 9, 7), null)).not.toThrow();
  });
});
