import { useState } from "react";
import { AlertTriangle, Check, CloudOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CachedSet } from "@/lib/active-session";

type Props = {
  sets: CachedSet[];
  onDelete: (key: string) => void;
  /** Return false to keep the editor open (e.g. the values were invalid). */
  onSaveEdit: (set: CachedSet, weight: string, reps: string) => boolean;
};

/** Sets logged for the current exercise, each editable and removable. */
export function LoggedSets({ sets, onDelete, onSaveEdit }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");

  if (sets.length === 0) return null;

  const startEdit = (x: CachedSet) => {
    setEditingKey(x.key);
    setEditWeight(String(x.weight_kg));
    setEditReps(String(x.reps));
  };

  return (
    <section aria-label="Logged sets" className="mt-8 divide-y divide-border rounded-lg border border-border bg-card">
      {sets.map((x) => (
        <div key={x.key} className="px-4 py-3">
          {editingKey === x.key ? (
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-sm font-semibold text-muted-foreground">Set {x.set_number}</span>
              <input aria-label="Corrected weight in kg" inputMode="decimal" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-primary/50 bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
              <span className="text-xs text-muted-foreground">kg</span>
              <input aria-label="Corrected reps" inputMode="numeric" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-primary/50 bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
              <span className="text-xs text-muted-foreground">reps</span>
              <Button type="button" size="sm" onClick={() => onSaveEdit(x, editWeight, editReps) && setEditingKey(null)}>Save</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">Set {x.set_number}</span>
              <span className="text-sm tabular-nums text-muted-foreground">{x.weight_kg} kg × {x.reps}</span>
              {x.status === "refused" ? (
                <span role="alert" className="inline-flex items-center gap-1 rounded-full border border-destructive/60 px-2 py-0.5 text-xs text-destructive">
                  <AlertTriangle className="size-3" aria-hidden="true" /> Couldn't save · fix or delete
                </span>
              ) : (
                x.status !== "saved" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    <CloudOff className="size-3" aria-hidden="true" /> Saved locally
                  </span>
                )
              )}
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => startEdit(x)} aria-label={`Edit set ${x.set_number}`} className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editingKey === x.key) setEditingKey(null);
                    onDelete(x.key);
                  }}
                  aria-label={`Delete set ${x.set_number}`}
                  className="flex size-11 items-center justify-center rounded-md text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
