import { useState } from "react";
import { Flame, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type SessionSummary = {
  id: string;
  completedAt: string;
  program: "premade" | "custom";
  sets: number;
  volume: number;
  exercises: string[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function SessionCard({
  session,
  onDelete,
  onOpen,
  deleting = false,
}: {
  session: SessionSummary;
  onDelete?: (id: string) => void;
  onOpen?: (session: SessionSummary) => void;
  deleting?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <article
      className={`rounded-lg border border-border bg-card p-6 ${onOpen ? "cursor-pointer transition hover:border-primary/60" : ""}`}
      onClick={onOpen ? () => onOpen(session) : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(session); } } : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `View details of workout from ${formatDate(session.completedAt)}` : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-primary">
            {formatDate(session.completedAt)}
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">{session.program === "custom" ? "Custom Routine" : "Pre-Made Plan"}</span>
          </p>
          <h2 className="mt-3 text-lg font-semibold">
            {session.sets} sets <span className="mx-1 text-primary">·</span> {session.exercises.length} exercises
          </h2>
          <p className="mt-2 truncate text-sm text-muted-foreground">{session.exercises.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex flex-col items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-primary">
            <Flame size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className="text-xs font-semibold">{session.volume} kg</span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
              onKeyDown={(e) => e.stopPropagation()}
              disabled={deleting}
              aria-label="Delete this workout"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {onDelete && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent className="border-border bg-card" onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this workout?</AlertDialogTitle>
              <AlertDialogDescription>
                Your session from {formatDate(session.completedAt)} will be removed for good. If it was logged this
                week, your weekly count drops by one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(session.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </article>
  );
}
