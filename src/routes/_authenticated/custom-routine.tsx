import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowLeft, ArrowUp, Check, LineChart, Plus, X } from "lucide-react";
import { ExerciseProgressChart } from "@/components/ExerciseProgressChart";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getExerciseLibrary, saveCustomRoutine } from "@/lib/gym.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/custom-routine")({
  head: () => ({ meta: [
    { title: "Custom Workout Editor — GymBuddy" },
    { name: "description", content: "Arrange and edit your own GymBuddy workout routine." },
    { property: "og:title", content: "Custom Workout Editor — GymBuddy" },
    { property: "og:description", content: "Arrange and edit your own GymBuddy workout routine." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CustomRoutine,
});

const FILTERS = [
  { label: "All", key: "all" },
  { label: "Chest (Horizontal Press)", key: "chest" },
  { label: "Back (Pull)", key: "back" },
  { label: "Legs (Squat/Hinge)", key: "legs" },
  { label: "Shoulders (Vertical Press)", key: "shoulders" },
  { label: "Arms & Core", key: "arms" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function categoryOf(type: string): Exclude<Filter, "all"> {
  const value = type.toLowerCase();
  if (value.includes("arms") || value.includes("core")) return "arms";
  if (value.includes("horizontal press")) return "chest";
  if (value.includes("vertical press")) return "shoulders";
  if (value.includes("pull") || value.includes("row")) return "back";
  return "legs";
}

function CustomRoutine() {
  const fetchLib = useServerFn(getExerciseLibrary);
  const save = useServerFn(saveCustomRoutine);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chartId, setChartId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["exercise-library"], queryFn: () => fetchLib() });

  useEffect(() => { if (data?.selected) setSelected([...new Set(data.selected)]); }, [data]);
  const exercises = data?.exercises ?? [];
  // Derived lists are memoized so taps on filters or reorder arrows don't
  // rebuild the whole exercise index every render.
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises]);
  const matchesFilter = (exercise: { movement_type: string }) => filter === "all" || categoryOf(exercise.movement_type) === filter;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const available = useMemo(
    () => exercises.filter((exercise) => !selectedSet.has(exercise.id) && (filter === "all" || categoryOf(exercise.movement_type) === filter)),
    [exercises, selectedSet, filter],
  );
  const addExercise = (id: string) => {
    if (selected.includes(id)) {
      toast.error("Already in your routine.");
      return;
    }
    setSelected((current) => [...current, id]);
  };
  const removeExercise = (id: string) => setSelected((current) => current.filter((item) => item !== id));
  const moveExercise = (index: number, direction: -1 | 1) => setSelected((current) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    const first = next[index];
    const second = next[nextIndex];
    if (first === undefined || second === undefined) return current;
    next[index] = second;
    next[nextIndex] = first;
    return next;
  });

  const handleSave = async () => {
    if (selected.length === 0 || saving || !data) return;
    setSaving(true);
    try {
      await save({ data: { exercise_ids: selected } });
      await queryClient.invalidateQueries({ queryKey: ["day-one-workout"] });
      await queryClient.invalidateQueries({ queryKey: ["exercise-library"] });
      toast.success("Custom Routine Updated, Bro! 🔧");
      navigate({ to: "/home" });
    } catch {
      setSaving(false);
      toast.error("Couldn't save your routine. Try again.");
    }
  };

  const filterRow = (insideDrawer: boolean) => (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filter exercises">
      {FILTERS.map((item) => (
        <Button key={item.key} type="button" size="sm" variant="outline" aria-pressed={filter === item.key}
          onClick={() => { setFilter(item.key); if (!insideDrawer) setDrawerOpen(true); }}
          className={cn("h-10 shrink-0 rounded-full border-border px-4 text-xs", filter === item.key ? "border-primary bg-primary/10 text-primary hover:text-primary" : "bg-card text-muted-foreground")}
        >{item.label}</Button>
      ))}
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-5 pb-36 pt-8 text-foreground sm:px-7">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <Link to="/home" aria-label="Back to Home" className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" /></Link>
        <h1 className="min-w-0 text-2xl font-semibold">Custom Routine Builder</h1>
      </header>
      <div className="mt-8">{filterRow(false)}</div>
      <section className="mt-9" aria-label="My Custom Routine Overview">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <h2 className="min-w-0 text-lg font-semibold">My Custom Routine Overview</h2>
          <span className="shrink-0 text-sm font-semibold text-primary" aria-live="polite">{selected.length} {selected.length === 1 ? "exercise" : "exercises"}</span>
        </div>
        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading exercises…</p>}
        {isError && <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">Couldn't load exercises. <Button variant="link" onClick={() => refetch()} className="px-0">Retry</Button></div>}
        {!isLoading && !isError && selected.length === 0 && <p className="mt-5 border-l-2 border-primary pl-4 text-sm text-muted-foreground">Your routine is empty. Add your first exercise below.</p>}
        <ol className="mt-5 space-y-2.5">
          {selected.map((id, index) => {
            const exercise = exerciseById.get(id);
            if (!exercise) return null;
            return (
              <li key={id} className="rounded-lg border border-border bg-card px-2 py-3.5 sm:px-3">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                <button type="button" onClick={() => setChartId((c) => (c === id ? null : id))} aria-expanded={chartId === id} aria-label={`Show strength progress for ${exercise.name}`} className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold">{exercise.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><LineChart className={cn("size-3", chartId === id ? "text-primary" : "")} aria-hidden="true" /> {exercise.movement_type} · {exercise.equipment_type}</p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => moveExercise(index, -1)} aria-label={`Move ${exercise.name} up`} title="Move up" className="size-8 text-muted-foreground hover:text-primary"><ArrowUp aria-hidden="true" /></Button>
                  <Button type="button" size="icon" variant="ghost" disabled={index === selected.length - 1} onClick={() => moveExercise(index, 1)} aria-label={`Move ${exercise.name} down`} title="Move down" className="size-8 text-muted-foreground hover:text-primary"><ArrowDown aria-hidden="true" /></Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeExercise(id)} aria-label={`Remove ${exercise.name}`} title="Remove exercise" className="size-8 text-muted-foreground hover:text-destructive"><X aria-hidden="true" /></Button>
                </div>
                </div>
                {chartId === id && <div className="animate-fade-in"><ExerciseProgressChart exerciseId={id} /></div>}
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="outline" disabled={isLoading || isError} onClick={() => setDrawerOpen(true)} className="mt-5 h-16 w-full rounded-lg border-dashed border-primary/70 bg-primary/5 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-primary"><Plus aria-hidden="true" /> Add Exercise to Routine</Button>
      </section>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[85dvh] rounded-t-lg border-border bg-background">
          <DrawerHeader className="mx-auto w-full max-w-lg px-5 pb-3 text-left">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0"><DrawerTitle className="text-xl">Add Exercise</DrawerTitle><DrawerDescription className="mt-2">{selected.length} in your routine</DrawerDescription></div>
              <Button size="icon" variant="ghost" onClick={() => setDrawerOpen(false)} aria-label="Close exercise library" className="size-9 shrink-0 text-muted-foreground"><X aria-hidden="true" /></Button>
            </div>
            <div className="mt-5">{filterRow(true)}</div>
          </DrawerHeader>
          <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {available.length === 0 && <p className="py-8 text-sm text-muted-foreground">Nothing left to add here — every exercise in this group is already in your routine.</p>}
            {FILTERS.filter((item) => item.key !== "all").map((group) => {
              const items = exercises.filter((exercise) => categoryOf(exercise.movement_type) === group.key && matchesFilter(exercise));
              if (!items.length) return null;
              return (
                <section key={group.key} className="mb-7">
                  <h3 className="mb-3 text-xs font-semibold uppercase text-primary">{group.label}</h3>
                  <ul className="space-y-2">{items.map((exercise) => {
                    const inRoutine = selected.includes(exercise.id);
                    return (
                      <li key={exercise.id}>
                        <Button type="button" variant="outline" disabled={inRoutine} onClick={() => addExercise(exercise.id)} aria-label={inRoutine ? `${exercise.name} — already in your routine` : `Add ${exercise.name}`} className={cn("h-auto min-h-16 w-full justify-between gap-3 whitespace-normal rounded-lg border-border bg-card px-4 py-3 text-left hover:border-primary/60", inRoutine && "border-primary/40 bg-primary/5")}>
                          <span className="min-w-0">
                            <span className="block font-medium">{exercise.name}</span>
                            <span className="block text-xs text-muted-foreground">{exercise.equipment_type} · {exercise.target}</span>
                            {inRoutine && <span className="mt-0.5 block text-xs font-semibold text-primary">In routine · exercise {selected.indexOf(exercise.id) + 1}</span>}
                          </span>
                          {inRoutine ? <Check className="shrink-0 text-primary" aria-hidden="true" /> : <Plus className="shrink-0 text-primary" aria-hidden="true" />}
                        </Button>
                      </li>
                    );
                  })}</ul>
                </section>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur sm:px-7">
        <div className="mx-auto max-w-lg"><Button size="lg" disabled={selected.length === 0 || saving || !data} onClick={handleSave} className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon">{saving ? "Saving…" : "Save Changes"}</Button></div>
      </div>
    </main>
  );
}
