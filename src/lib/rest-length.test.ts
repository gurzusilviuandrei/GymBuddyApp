import { describe, expect, it } from "vitest";
import { readRestLength, rememberRestLength, REST_LENGTH_KEY } from "./rest-length";

function fakeStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string): string | null => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

describe("remembering the rest length", () => {
  it("has no choice until the member makes one", () => {
    expect(readRestLength(fakeStore())).toBeNull();
  });

  it("brings back what was chosen", () => {
    const store = fakeStore();
    rememberRestLength(120, store);
    expect(readRestLength(store)).toBe(120);
    rememberRestLength(45, store);
    expect(readRestLength(store)).toBe(45);
  });

  it("ignores values that are not one of the rest options", () => {
    const store = fakeStore();
    rememberRestLength(77, store);
    expect(store.data[REST_LENGTH_KEY]).toBeUndefined();
    expect(readRestLength(fakeStore({ [REST_LENGTH_KEY]: "9999" }))).toBeNull();
    expect(readRestLength(fakeStore({ [REST_LENGTH_KEY]: "abc" }))).toBeNull();
  });

  it("never throws when storage is missing or blocked", () => {
    expect(readRestLength(null)).toBeNull();
    expect(() => rememberRestLength(60, null)).not.toThrow();
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readRestLength(blocked)).toBeNull();
    expect(() => rememberRestLength(60, blocked)).not.toThrow();
  });
});
