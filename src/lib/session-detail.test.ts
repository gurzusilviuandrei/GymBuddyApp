import { describe, expect, it } from "vitest";
import { groupSessionSets, type SessionLogRow } from "./session-detail";

const row = (id: string, exercise_id: string, set_number: number, over: Partial<SessionLogRow> = {}): SessionLogRow => ({
  id,
  exercise_id,
  set_number,
  weight_kg: 20,
  reps_completed: 10,
  exercises: { name: exercise_id.toUpperCase() },
  ...over,
});

describe("History's per-exercise sets", () => {
  it("numbers sets by position even when the stored numbers repeat after a deleted middle set", () => {
    // Sets 1, 2, 3 logged; set 2 deleted on the phone (which renumbered 3 -> 2 locally only);
    // the next set was then logged as 3 again, so the server holds 1, 3, 3.
    const groups = groupSessionSets([row("a", "squat", 1), row("b", "squat", 3), row("c", "squat", 3)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.sets.map((s) => s.set_number)).toEqual([1, 2, 3]);
    expect(groups[0]?.sets.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("closes gaps and starts again at 1 for each exercise", () => {
    const groups = groupSessionSets([row("a", "squat", 2), row("b", "squat", 5), row("c", "press", 4), row("d", "press", 9)]);
    expect(groups.map((g) => [g.exercise_id, g.sets.map((s) => s.set_number)])).toEqual([
      ["squat", [1, 2]],
      ["press", [1, 2]],
    ]);
  });

  it("keeps the exercises in the order they were first done and reads weights as numbers", () => {
    const groups = groupSessionSets([row("a", "press", 1, { weight_kg: "42.5", reps_completed: 8 }), row("b", "squat", 1)]);
    expect(groups.map((g) => g.exercise_id)).toEqual(["press", "squat"]);
    expect(groups[0]?.sets[0]).toEqual({ id: "a", set_number: 1, weight_kg: 42.5, reps: 8 });
  });

  it("finds the exercise name whether the join returns an object or a list, and falls back to the id", () => {
    const groups = groupSessionSets([
      row("a", "squat", 1, { exercises: [{ name: "Goblet Squat" }] }),
      row("b", "press", 1, { exercises: { name: "Chest Press" } }),
      row("c", "mystery", 1, { exercises: null }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Goblet Squat", "Chest Press", "mystery"]);
  });

  it("returns nothing for a workout with no sets", () => {
    expect(groupSessionSets([])).toEqual([]);
  });
});
