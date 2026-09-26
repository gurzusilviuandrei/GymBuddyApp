import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getExerciseLibrary, saveCustomRoutine } from "@/lib/gym.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/custom-routine")({
  head: () => ({
    meta: [
      { title: "Custom Routine Builder — GymBuddy" },
      { name: "description", content: "Pick 3 exercises to build your own GymBuddy workout day." },
      { property: "og:title", content: "Custom Routine Builder — GymBuddy" },
      { property: "og:description", content: "Pick 3 exercises to build your own GymBuddy workout day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomRoutine,
});

const GROUPS = ["Squats & Hinges", "Presses", "Pulls"] as const;
function groupOf(type: string): (typeof GROUPS)[number] {
  const t = type.toLowerCase();
  if (t.includes("press")) return "Presses";
  if (t.includes("pull")) return "Pulls";
  return "Squats & Hinges";
}

function CustomRoutine() {
  const fetchLib = useServerFn(getExerciseLibrary);
  const save = useServerFn(saveCustomRoutine);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["exercise-library"], queryFn: () => fetchLib() });

  useEffect(() => {
    if (data?.selected.length === 3) setSelected(data.selected);
  }, [data]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]));

  const handleSave = async () => {
    if (selected.length !== 3 || saving) return;
    setSaving(true);
    try {
      await save({ data: { exercise_ids: selected } });
      await queryClient.invalidateQueries({ queryKey: ["day-one-workout"] });
      toast.success("Custom Routine Saved, Bro! 🏋️‍♂️");
      navigate({ to: "/home" });
    } catch {
      setSaving(false);
      toast.error("Couldn't save your routine. Try again.");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-36 pt-10 text-foreground">
      <header className="flex items-center gap-4">
        <Link to="/home" aria-label="Back to Home" className="flex size-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-semibold">Custom Routine Builder</h1>
      </header>

      <div className="sticky top-0 z-10 -mx-7 mt-6 border-b border-border bg-background/95 px-7 py-4 backdrop-blur" aria-live="polite">
        <p className="text-sm font-semibold uppercase tracking-widest">
          Selected: <span className={selected.length === 3 ? "text-primary" : "text-foreground"}>{selected.length}</span>/3 Exercises
        </p>
      </div>

      {isLoading && <p className="mt-8 text-muted-foreground">Loading exercises…</p>}

      {GROUPS.map((group) => {
        const items = (data?.exercises ?? []).filter((e) => groupOf(e.movement_type) === group);
        if (!items.length) return null;
        return (
          <section key={group} className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">{group}</h2>
            <ul className="space-y-2">
              {items.map((ex) => {
                const on = selected.includes(ex.id);
                const disabled = !on && selected.length >= 3;
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => toggle(ex.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border bg-card px-5 py-4 text-left transition-colors",
                        on ? "border-primary" : "border-border",
                        disabled && "opacity-40",
                      )}
                    >
                      <span>
                        <span className="block font-medium">{ex.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {ex.movement_type} · {ex.equipment_type} · {ex.target}
                        </span>
                      </span>
                      <span className={cn("flex size-6 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground")}>
                        {on && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-7 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button size="lg" disabled={selected.length !== 3 || saving} onClick={handleSave} className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon">
            {saving ? "Saving…" : "Save Custom Routine"}
          </Button>
        </div>
      </div>
    </main>
  );
}
