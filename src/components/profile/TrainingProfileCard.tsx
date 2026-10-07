import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readActiveSession } from "@/lib/active-session";
import { useBackToClose } from "@/lib/back-stack";
import { durableStorage } from "@/lib/durable-storage";
import { getTrainingProfile, updateTrainingProfile } from "@/lib/gym-api";
import { cn } from "@/lib/utils";
import {
  checkTrainingForm,
  EQUIPMENT_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  labelFor,
  NAME_MAX,
  restartsPlan,
  sameProfile,
  type TrainingForm,
  type TrainingProfile,
} from "@/lib/training-profile";

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-11 rounded-lg border-2 px-4 py-2 text-left text-sm font-medium transition-colors",
              value === o.id ? "border-primary bg-primary/10 text-primary" : "border-input text-foreground hover:border-primary/60",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The profile screen's "Training profile" card: what the member told us at sign-up, editable. */
export function TrainingProfileCard() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, isError, refetch } = useQuery({ queryKey: ["training-profile"], queryFn: getTrainingProfile });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<TrainingForm | null>(null);
  const [problem, setProblem] = useState<{ field: "name" | "age"; message: string } | null>(null);

  const stopEditing = () => {
    setEditing(false);
    setProblem(null);
  };
  useBackToClose(editing, stopEditing);

  const save = useMutation({
    mutationFn: (next: TrainingProfile) => updateTrainingProfile({ data: next }),
    onSuccess: async (result, next) => {
      // The copy kept for offline start-up and the Home greeting.
      try {
        const existing = JSON.parse(durableStorage.getItem("gymbuddy-profile") ?? "{}") as Record<string, unknown>;
        durableStorage.setItem(
          "gymbuddy-profile",
          JSON.stringify({ ...existing, name: next.name, age: next.age, frequency: next.frequency, goal: next.goal, equipment: next.equipment }),
        );
      } catch {
        /* the server has it; the cache refreshes on next start */
      }
      // Plans, targets and swap lists depend on these answers.
      await queryClient.invalidateQueries();
      stopEditing();
      toast.success(result.restarted ? "Profile updated. Your plan restarts at Day A." : "Profile updated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save your profile. Try again."),
  });

  const begin = () => {
    if (!profile) return;
    setForm({ name: profile.name, age: String(profile.age), frequency: profile.frequency, goal: profile.goal, equipment: profile.equipment });
    setProblem(null);
    setEditing(true);
  };

  // A workout in progress belongs to the current plan: switching equipment under it would mix two plans.
  const workoutInProgress = editing && readActiveSession() !== null;
  const equipmentChanged = Boolean(profile && form && restartsPlan(profile.equipment, form.equipment));
  const blocked = equipmentChanged && workoutInProgress;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form || !profile || blocked) return;
    const checked = checkTrainingForm(form);
    if (!checked.ok) {
      setProblem({ field: checked.field, message: checked.message ?? "Check this box." });
      return;
    }
    setProblem(null);
    if (sameProfile(profile, checked.profile)) {
      stopEditing();
      return;
    }
    save.mutate(checked.profile);
  };

  return (
    <section className="mt-10" aria-labelledby="training-profile-title">
      <div className="flex items-center gap-3">
        <Dumbbell className="size-5 text-primary" aria-hidden="true" />
        <h2 id="training-profile-title" className="text-lg font-semibold">Training profile</h2>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card p-5">
        {isLoading && <p className="text-sm text-muted-foreground">Loading your profile…</p>}

        {isError && !profile && (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Couldn't load your training profile. Check your signal.</span>
            <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold text-primary">Retry</button>
          </div>
        )}

        {profile && !editing && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="min-w-0 break-words text-right font-medium">{profile.name}</dd>
              <dt className="text-muted-foreground">Age</dt>
              <dd className="text-right font-medium">{profile.age}</dd>
              <dt className="text-muted-foreground">Equipment</dt>
              <dd className="text-right font-medium">{labelFor(EQUIPMENT_OPTIONS, profile.equipment)}</dd>
              <dt className="text-muted-foreground">Training</dt>
              <dd className="text-right font-medium">{labelFor(FREQUENCY_OPTIONS, profile.frequency)}</dd>
              <dt className="text-muted-foreground">Goal</dt>
              <dd className="text-right font-medium">{labelFor(GOAL_OPTIONS, profile.goal)}</dd>
            </dl>
            <Button type="button" variant="outline" className="mt-5 w-full" onClick={begin}>
              <Pencil aria-hidden="true" /> Edit training profile
            </Button>
          </>
        )}

        {profile && editing && form && (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <label className="block space-y-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Name
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={NAME_MAX}
                autoComplete="name"
                aria-invalid={problem?.field === "name"}
                className="h-12 border-input bg-background px-4 text-base normal-case tracking-normal text-foreground"
              />
              {problem?.field === "name" && <span role="alert" className="block text-sm normal-case tracking-normal text-destructive-text">{problem.message}</span>}
            </label>
            <label className="block space-y-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Age
              <Input
                value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })}
                inputMode="numeric"
                aria-invalid={problem?.field === "age"}
                className="h-12 border-input bg-background px-4 text-base normal-case tracking-normal text-foreground"
              />
              {problem?.field === "age" && <span role="alert" className="block text-sm normal-case tracking-normal text-destructive-text">{problem.message}</span>}
            </label>
            <OptionGroup label="Equipment" options={EQUIPMENT_OPTIONS} value={form.equipment} onChange={(equipment) => setForm({ ...form, equipment })} />
            {equipmentChanged && !blocked && (
              <p role="status" className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
                Changing your equipment switches you to a different plan, and it restarts at Day A.
              </p>
            )}
            {blocked && (
              <p role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-foreground">
                You have a workout in progress. Finish or abandon it on Home before changing your equipment.
              </p>
            )}
            <OptionGroup label="Days per week" options={FREQUENCY_OPTIONS} value={form.frequency} onChange={(frequency) => setForm({ ...form, frequency })} />
            <OptionGroup label="Goal" options={GOAL_OPTIONS} value={form.goal} onChange={(goal) => setForm({ ...form, goal })} />
            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={save.isPending || blocked}>{save.isPending ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="outline" onClick={stopEditing} disabled={save.isPending}>Cancel</Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
