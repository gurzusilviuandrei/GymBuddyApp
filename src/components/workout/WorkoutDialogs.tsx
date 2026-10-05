// Small overlays on the workout screen: personal-record celebration, the idle
// nudge, and the "leave this workout?" guard.
import { X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PersonalRecordDialog({ weight, name, onClose }: { weight: number; name: string; onClose: () => void }) {
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
      <button type="button" onClick={onDismiss} aria-label="Dismiss reminder" className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>
    </div>
  );
}

export function LeaveWorkoutDialog({ onStay, onAbandon }: { onStay: () => void; onAbandon: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 px-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="exit-title">
      <div className="w-full max-w-sm rounded-lg border border-primary/40 bg-card p-6 text-center">
        <p id="exit-title" className="text-xl font-semibold text-foreground">Active Workout in Progress!</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Are you sure you want to abandon your workout? Progressive stats for this session will not be saved.</p>
        <Button type="button" onClick={onStay} className="mt-6 h-12 w-full font-semibold shadow-neon">Continue Training</Button>
        <Button type="button" variant="outline" onClick={onAbandon} className="mt-3 h-12 w-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive">Abandon Session</Button>
      </div>
    </div>
  );
}
