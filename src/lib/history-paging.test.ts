import { describe, expect, it } from "vitest";
import { canShowOlder, HISTORY_MAX, HISTORY_PAGE, nextHistoryLimit } from "./history-paging";

describe("History paging", () => {
  it("offers older workouts only when the last request came back full", () => {
    expect(canShowOlder(100, 100)).toBe(true);
    expect(canShowOlder(99, 100)).toBe(false);
    expect(canShowOlder(0, 100)).toBe(false);
    expect(canShowOlder(200, 200)).toBe(true);
    expect(canShowOlder(137, 200)).toBe(false);
  });

  it("grows 100 at a time and stops at the server's 1,000-row limit", () => {
    expect(nextHistoryLimit(HISTORY_PAGE)).toBe(200);
    expect(nextHistoryLimit(900)).toBe(1000);
    expect(nextHistoryLimit(1000)).toBe(HISTORY_MAX);
    expect(canShowOlder(1000, 1000)).toBe(false);
  });
});
