// Turns the sets of a finished workout into the per-exercise lists History shows.
// Kept free of the Supabase client so it can be tested.

export type SessionLogRow = {
  id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | string;
  reps_completed: number;
  exercises: { name: string } | { name: string }[] | null;
};

export type SessionExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: { id: string; set_number: number; weight_kg: number; reps: number }[];
};

/**
 * `logs` must already be in the order the sets were done. Sets are numbered by their
 * position in the exercise (1, 2, 3…), not by the stored `set_number`: deleting a middle
 * set renumbers sets on the phone only, so the stored numbers can repeat or skip.
 */
export function groupSessionSets(logs: SessionLogRow[]): SessionExerciseGroup[] {
  const groups: SessionExerciseGroup[] = [];
  for (const l of logs) {
    let g = groups.find((x) => x.exercise_id === l.exercise_id);
    if (!g) {
      const ex = l.exercises;
      const name = Array.isArray(ex) ? ex[0]?.name : ex?.name;
      g = { exercise_id: l.exercise_id, name: name ?? l.exercise_id, sets: [] };
      groups.push(g);
    }
    g.sets.push({ id: l.id, set_number: g.sets.length + 1, weight_kg: Number(l.weight_kg), reps: l.reps_completed });
  }
  return groups;
}
