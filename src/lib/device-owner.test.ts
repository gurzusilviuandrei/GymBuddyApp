import { beforeEach, describe, expect, it } from "vitest";
import { ACCOUNT_DATA_KEYS, claimDeviceData, clearAccountData, DEVICE_OWNER_KEY } from "./device-owner";
import { durableStorage } from "./durable-storage";

// Web storage stand-in (tests run in Node, where the app uses localStorage).
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const queuedSet = JSON.stringify([{ key: "s1", id: null, exercise_id: "goblet-squat", weight_kg: 40, reps: 10 }]);

beforeEach(() => store.clear());

describe("claimDeviceData", () => {
  it("stamps a fresh phone with the account that signs in", () => {
    expect(claimDeviceData("member-a")).toBe(false);
    expect(durableStorage.getItem(DEVICE_OWNER_KEY)).toBe("member-a");
  });

  it("keeps waiting sets when the same member signs back in", () => {
    claimDeviceData("member-a");
    durableStorage.setItem("gymbuddy_offline_queue", queuedSet);
    expect(claimDeviceData("member-a")).toBe(false);
    expect(durableStorage.getItem("gymbuddy_offline_queue")).toBe(queuedSet);
  });

  it("never hands one member's sets, workout or caches to another account", () => {
    claimDeviceData("member-a");
    for (const key of ACCOUNT_DATA_KEYS) durableStorage.setItem(key, "member-a data");
    localStorage.setItem("gymbuddy-bag-checklist", '["water"]');

    expect(claimDeviceData("member-b")).toBe(true);

    for (const key of ACCOUNT_DATA_KEYS) expect(durableStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem("gymbuddy-bag-checklist")).toBeNull();
    expect(durableStorage.getItem(DEVICE_OWNER_KEY)).toBe("member-b");
  });

  it("recognises the owner of data saved before ownership was recorded", () => {
    durableStorage.setItem("gymbuddy-profile", JSON.stringify({ userId: "member-a", name: "A" }));
    durableStorage.setItem("gymbuddy_offline_queue", queuedSet);
    expect(claimDeviceData("member-a")).toBe(false);
    expect(durableStorage.getItem("gymbuddy_offline_queue")).toBe(queuedSet);

    store.delete(DEVICE_OWNER_KEY);
    expect(claimDeviceData("member-b")).toBe(true);
    expect(durableStorage.getItem("gymbuddy_offline_queue")).toBeNull();
  });
});

describe("clearAccountData", () => {
  it("erases everything, including who owned it", () => {
    claimDeviceData("member-a");
    durableStorage.setItem("gymbuddy-active-session", "{}");
    clearAccountData();
    expect(durableStorage.getItem("gymbuddy-active-session")).toBeNull();
    expect(durableStorage.getItem(DEVICE_OWNER_KEY)).toBeNull();
  });
});
