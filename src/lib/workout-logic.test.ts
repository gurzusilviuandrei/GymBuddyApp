import { describe, expect, it } from "vitest";
import type { ActiveSession, CachedSet } from "./active-session";
import {
  buildCues,
  canResume,
  durationMinutes,
  formatClock,
  exercisesDone,
  lastSetFor,
  newSetKey,
  parseCorrection,
  parseNewSet,
  progression,
  removeSet,
  restRemaining,
  sessionTargets,
  shiftRestEnd,
  type Exercise,
} from "./workout-logic";

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: "goblet-squat",
  name: "Goblet Squat",
  instructions: "Squat down.",
  setup_cue: "Hold a dumbbell.",
  position_cue: "Feet wide.",
  movement_cue: "Sit between knees.",
  video_url: null,
  alternative_exercise_id: null,
  ...over,
});

const set = (key: string, exercise_index: number, set_number: number, over: Partial<CachedSet> = {}): CachedSet => ({
  key,
  id: null,
  exercise_index,
  exercise_id: "goblet-squat",
  set_number,
  weight_kg: 20,
  reps: 10,
  status: "saved",
  ...over,
});

describe("buildCues", () => {
  it("shows the exercise's own three cues", () => {
    expect(buildCues(ex()).map(([, cue]) => cue)).toEqual(["Hold a dumbbell.", "Feet wide.", "Sit between knees."]);
  });
  it("falls back sensibly when cues are missing", () => {
    const cues = buildCues(ex({ setup_cue: null, position_cue: null, movement_cue: null }));
    expect(cues).toHaveLength(3);
    expect(cues[2]?.[1]).toBe("Squat down.");
  });
  it("is empty while the exercise loads", () => {
    expect(buildCues(undefined)).toEqual([]);
  });
});

describe("sessionTargets", () => {
  it("keeps the plan when not sore", () => {
    expect(sessionTargets(3, 10, false)).toEqual({ targetSets: 3, targetReps: 10 });
  });
  it("drops 3+ sets to 2 when super sore", () => {
    expect(sessionTargets(4, 10, true)).toEqual({ targetSets: 2, targetReps: 10 });
  });
  it("trims 2 reps instead when there are fewer than 3 sets", () => {
    expect(sessionTargets(2, 10, true)).toEqual({ targetSets: 2, targetReps: 8 });
    expect(sessionTargets(1, 2, true)).toEqual({ targetSets: 1, targetReps: 1 });
  });
});

describe("progression", () => {
  it("suggests +2.5 kg after hitting every set and rep", () => {
    const p = progression({ weight_kg: 40, reps_completed: 10, sets_completed: 3, min_reps: 10, top_weight_kg: 40 }, 3, 10);
    expect(p).toMatchObject({ hitAll: true, stepUp: 42.5, suggested: 42.5 });
  });
  it("repeats the weight when a set or rep was missed", () => {
    expect(progression({ weight_kg: 40, reps_completed: 10, sets_completed: 2, min_reps: 10 }, 3, 10)).toMatchObject({ hitAll: false, suggested: 40 });
    expect(progression({ weight_kg: 40, reps_completed: 10, sets_completed: 3, min_reps: 8 }, 3, 10)).toMatchObject({ hitAll: false, suggested: 40 });
  });
  it("uses the heaviest set of the session as the base", () => {
    expect(progression({ weight_kg: 35, reps_completed: 10, sets_completed: 3, min_reps: 10, top_weight_kg: 40 }, 3, 10).base).toBe(40);
  });
  it("treats a single just-logged set as one set done", () => {
    expect(progression({ weight_kg: 40, reps_completed: 10 }, 3, 10).hitAll).toBe(false);
  });
  it("avoids floating-point noise", () => {
    expect(progression({ weight_kg: 0.1, reps_completed: 10, sets_completed: 3, min_reps: 10 }, 3, 10).stepUp).toBe(2.6);
  });
});

describe("parsing sets", () => {
  it("accepts a normal set, including bodyweight (0 kg) and decimals", () => {
    expect(parseNewSet("22.5", "8")).toEqual({ weight: 22.5, reps: 8 });
    expect(parseNewSet("0", "12")).toEqual({ weight: 0, reps: 12 });
  });
  it("rejects empty, negative, fractional or zero reps", () => {
    for (const [w, r] of [["", "8"], ["-5", "8"], ["20", "0"], ["20", "7.5"], ["abc", "8"], ["20", ""]]) {
      expect(parseNewSet(w!, r!), `${w}/${r}`).toBeNull();
    }
  });
  it("rejects a typed set the database would refuse (it would never sync and block Finish)", () => {
    expect(parseNewSet("1000", "100")).toEqual({ weight: 1000, reps: 100 });
    expect(parseNewSet("1000.5", "10")).toBeNull();
    expect(parseNewSet("60", "150")).toBeNull();
  });
  it("bounds corrections to what the database accepts", () => {
    expect(parseCorrection("1000", "100")).toEqual({ weight: 1000, reps: 100 });
    expect(parseCorrection("1000.5", "10")).toBeNull();
    expect(parseCorrection("50", "101")).toBeNull();
  });
});

describe("removeSet", () => {
  const sets = [set("a", 0, 1), set("b", 0, 2), set("c", 1, 1), set("d", 0, 3)];
  it("renumbers the remaining sets of that exercise only", () => {
    expect(removeSet(sets, "b").map((s) => [s.key, s.set_number])).toEqual([["a", 1], ["c", 1], ["d", 2]]);
  });
  it("leaves the list alone for an unknown set", () => {
    expect(removeSet(sets, "zzz")).toBe(sets);
  });
});

describe("rest timer maths", () => {
  it("rounds remaining time up and never goes negative", () => {
    expect(restRemaining(10_000, 0)).toBe(10);
    expect(restRemaining(10_000, 9_001)).toBe(1);
    expect(restRemaining(10_000, 12_000)).toBe(0);
  });
  it("moves the end when the rest length changes", () => {
    expect(shiftRestEnd(100_000, 90, 60)).toBe(70_000);
    expect(shiftRestEnd(100_000, 60, 120)).toBe(160_000);
  });
  it("formats as m:ss", () => {
    expect([formatClock(90), formatClock(5), formatClock(0), formatClock(120)]).toEqual(["1:30", "0:05", "0:00", "2:00"]);
  });
});

describe("resuming a workout", () => {
  const cached = { current_exercise_index: 2, is_custom_workout: false } as ActiveSession;
  it("resumes only the same kind of workout that still has that exercise", () => {
    expect(canResume(cached, false, 4)).toBe(true);
    expect(canResume(cached, true, 4)).toBe(false);
    expect(canResume(cached, false, 2)).toBe(false);
    expect(canResume(null, false, 4)).toBe(false);
  });
  it("pre-fills from the last set of the current exercise", () => {
    const sets = [set("a", 0, 1, { weight_kg: 10 }), set("b", 1, 1, { weight_kg: 30 }), set("c", 0, 2, { weight_kg: 12 })];
    expect(lastSetFor(sets, 0, "goblet-squat")?.weight_kg).toBe(12);
    expect(lastSetFor(sets, 2, "goblet-squat")).toBeUndefined();
  });
  it("never pre-fills from the exercise that was swapped out", () => {
    const sets = [set("a", 0, 1, { weight_kg: 60, exercise_id: "back-squat" }), set("b", 0, 1, { weight_kg: 100, exercise_id: "leg-press" })];
    expect(lastSetFor(sets, 0, "leg-press")?.weight_kg).toBe(100);
    expect(lastSetFor([sets[0]!], 0, "leg-press")).toBeUndefined();
  });
});

describe("saving a workout", () => {
  it("lists every exercise with sets in plan order, including one swapped out mid-way", () => {
    const sets = [
      set("a", 1, 1, { exercise_id: "db-bench" }),
      set("b", 0, 1, { exercise_id: "back-squat" }),
      set("c", 0, 1, { exercise_id: "leg-press" }), // swapped in after one squat set
      set("d", 1, 2, { exercise_id: "db-bench" }),
    ];
    expect(exercisesDone(sets)).toEqual(["back-squat", "leg-press", "db-bench"]);
  });
});

describe("misc", () => {
  it("makes distinct set keys", () => {
    expect(newSetKey(1, 0.123)).not.toBe(newSetKey(1, 0.456));
  });
  it("counts at least one minute of workout", () => {
    const start = new Date(0).toISOString();
    expect(durationMinutes(start, 10_000)).toBe(1);
    expect(durationMinutes(start, 45 * 60_000)).toBe(45);
  });
});
