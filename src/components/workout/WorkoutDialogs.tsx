// Small overlays on the workout screen: personal-record celebration, the idle
// nudge, and the "leave this workout?" guard.
import { X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackToClose } from "@/lib/back-stack";

export function PersonalRecordDialog({ weight, name, onClose }: { weight: number; name: string; onClose: () => void }) {
  useBackToClose(true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="alertdialog" aria-live="assertive" aria-label="New personal record" className="w-full max-w-sm rounded-2xl border-2 border-primary bg-card p-7 text-center shadow-neon" onClick={(e) => e.stopPropagation()}>
        <p className="text-5xl" aria-hidden="true">🏆</p>
        <p className="mt-4 text-2xl font-bold text-primary">New Personal Record! 🔥</p>
        <p className="mt-3 text-base leading-relaxed text-foreground">{weight}kg is your heaviest {name} to date, Bro!</p>
        <Button type="button" onClick={onClose} className="mt-6 h-12 w-full rounded-lg text-base font-semibold shadow-neon">Let's Go!</Button>
      </div>
    </div>
  );
}

export function IdleNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-primary/60 bg-card/95 px-4 py-3 shadow-neon backdrop-blur animate-fade-in">
      <Zap className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="flex-1 text-sm text-foreground">Ready for the next set, Bro? Let's keep your momentum going.</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss reminder" className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>
    </div>
  );
}

export function LeaveWorkoutDialog({ onStay, onAbandon, onLeave }: { onStay: () => void; onAbandon: () => void; onLeave?: () => void }) {
  // Android Back keeps the workout, like "Continue Training".
  useBackToClose(true, onStay);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 px-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="w-full max-w-sm rounded-lg border border-primary/40 bg-card p-6 text-center">
        <p id="exit-title" className="text-xl font-semibold text-foreground">Active Workout in Progress!</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {onLeave
            ? "Leave it for now and pick it up later from Home, or abandon it: the sets you logged in this session will be removed."
            : "Are you sure you want to abandon your workout? The sets you logged in this session will be removed."}
        </p>
        <Button type="button" onClick={onStay} className="mt-6 h-12 w-full font-semibold shadow-neon">Continue Training</Button>
        {onLeave && (
          <Button type="button" variant="outline" onClick={onLeave} className="mt-3 h-12 w-full border-primary/60 text-primary hover:bg-primary/10 hover:text-primary">Leave it for now</Button>
        )}
        <Button type="button" variant="outline" onClick={onAbandon} className="mt-3 h-12 w-full border-destructive/60 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text">Abandon Session</Button>
      </div>
    </div>
  );
}

/**
 * Shown when a saved workout was left open for more than 12 hours. It is never resumed
 * silently: the member finishes it (saved on the day it happened) or discards it.
 * Android Back and "Decide later" close the dialog and keep everything.
 */
export function UnfinishedWorkoutDialog({
  dateLabel,
  setCount,
  busy = false,
  onFinish,
  onDiscard,
  onClose,
}: {
  dateLabel: string;
  setCount: number;
  busy?: boolean;
  onFinish: () => void;
  onDiscard: () => void;
  onClose: () => void;
}) {
  useBackToClose(true, onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 px-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="unfinished-title" aria-describedby="unfinished-body">
      <div className="w-full max-w-sm rounded-lg border border-primary/40 bg-card p-6 text-center">
        <p id="unfinished-title" className="text-xl font-semibold text-foreground">You have an unfinished workout from {dateLabel}</p>
        <p id="unfinished-body" className="mt-3 text-sm leading-relaxed text-muted-foreground">
          It has {setCount} logged {setCount === 1 ? "set" : "sets"}. Finish it to save it as that day's workout, or discard it to remove its sets.
        </p>
        <Button type="button" onClick={onFinish} disabled={busy} className="mt-6 h-12 w-full font-semibold shadow-neon">Finish it</Button>
        <Button type="button" variant="outline" onClick={onDiscard} disabled={busy} className="mt-3 h-12 w-full border-destructive/60 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text">Discard it</Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy} className="mt-2 w-full text-muted-foreground">Decide later</Button>
      </div>
    </div>
  );
}
