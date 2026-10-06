import { describe, expect, it, vi } from "vitest";
import { pushBackHandler, runBackHandler } from "./back-stack";

describe("Android Back and open dialogs", () => {
  it("does nothing (lets the screen navigate) when no dialog is open", () => {
    expect(runBackHandler()).toBe(false);
  });

  it("closes the newest dialog first, then the one under it", () => {
    const lower = vi.fn();
    const upper = vi.fn();
    const removeLower = pushBackHandler(lower);
    const removeUpper = pushBackHandler(upper);
    expect(runBackHandler()).toBe(true);
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    removeUpper();
    expect(runBackHandler()).toBe(true);
    expect(lower).toHaveBeenCalledTimes(1);
    removeLower();
    expect(runBackHandler()).toBe(false);
  });

  it("forgets a dialog that was closed some other way", () => {
    const handler = vi.fn();
    const remove = pushBackHandler(handler);
    remove();
    remove(); // removing twice is harmless
    expect(runBackHandler()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
