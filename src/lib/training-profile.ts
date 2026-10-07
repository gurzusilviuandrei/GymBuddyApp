// The answers a member gives about their training (onboarding, and Edit training profile on
// the Profile screen). Free of React and the network, so the rules are unit-tested in
// training-profile.test.ts.
import { checkAge } from "./onboarding-validation";

export const EQUIPMENT_OPTIONS = [
  { id: "full-gym", label: "Full Gym Machines" },
  { id: "dumbbells", label: "Dumbbells Only" },
  { id: "barbell", label: "Barbell Only" },
] as const;

export const FREQUENCY_OPTIONS = [
  { id: "2-days", label: "2 Days / Week" },
  { id: "3-days", label: "3 Days / Week" },
  { id: "4-plus", label: "4+ Days / Week" },
] as const;

export const GOAL_OPTIONS = [
  { id: "lose-weight", label: "Lose Weight", subtext: "Burn fat and improve stamina" },
  { id: "gain-muscle", label: "Gain Muscle", subtext: "Build strength and solid mass" },
  { id: "sports-performance", label: "Sports Performance", subtext: "Improve speed and athletic agility" },
] as const;

export type Equipment = (typeof EQUIPMENT_OPTIONS)[number]["id"];
export type Frequency = (typeof FREQUENCY_OPTIONS)[number]["id"];
export type Goal = (typeof GOAL_OPTIONS)[number]["id"];

/** The longest name the database stores. */
export const NAME_MAX = 60;

export type TrainingProfile = { name: string; age: number; frequency: Frequency; goal: Goal; equipment: Equipment };

/** The database keeps the number of training days; the form talks in the three onboarding choices. */
export function frequencyFromDays(days: number | null | undefined): Frequency {
  if (days == null || days >= 4) return days == null ? "3-days" : "4-plus";
  return days <= 2 ? "2-days" : "3-days";
}

/** The profile as the database holds it, or null when a field is missing (not onboarded). */
export function profileFromRow(row: {
  full_name: string | null;
  age: number | null;
  weekly_goal_days: number | null;
  primary_goal: string | null;
  equipment_type: string | null;
}): TrainingProfile | null {
  const goal = GOAL_OPTIONS.find((g) => g.id === row.primary_goal)?.id;
  const equipment = EQUIPMENT_OPTIONS.find((e) => e.id === row.equipment_type)?.id;
  if (!row.full_name || row.age == null || !goal || !equipment) return null;
  return { name: row.full_name, age: row.age, frequency: frequencyFromDays(row.weekly_goal_days), goal, equipment };
}

export type TrainingForm = { name: string; age: string; frequency: Frequency; goal: Goal; equipment: Equipment };

export type CheckedForm =
  | { ok: true; profile: TrainingProfile }
  /** `field` says which box to point at; `message` is null while a box is still empty. */
  | { ok: false; field: "name" | "age"; message: string | null };

export function checkTrainingForm(form: TrainingForm): CheckedForm {
  const name = form.name.trim();
  if (name === "") return { ok: false, field: "name", message: "Enter your name." };
  if (name.length > NAME_MAX) return { ok: false, field: "name", message: `Your name can be up to ${NAME_MAX} characters.` };
  const age = checkAge(form.age);
  if (!age.ok) return { ok: false, field: "age", message: age.message ?? "Enter your age." };
  return { ok: true, profile: { name, age: age.age, frequency: form.frequency, goal: form.goal, equipment: form.equipment } };
}

export function sameProfile(a: TrainingProfile, b: TrainingProfile): boolean {
  return a.name === b.name && a.age === b.age && a.frequency === b.frequency && a.goal === b.goal && a.equipment === b.equipment;
}

/** Changing equipment moves the member to a different plan, so the A-B-C rotation restarts at Day A. */
export function restartsPlan(current: Equipment, next: Equipment): boolean {
  return current !== next;
}

export function labelFor<T extends { id: string; label: string }>(options: readonly T[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}
