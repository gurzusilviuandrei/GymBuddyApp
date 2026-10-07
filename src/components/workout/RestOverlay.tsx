import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock, REST_OPTIONS } from "@/lib/workout-logic";

type Props = {
  secondsLeft: number;
  restSecs: number;
  chimeMuted: boolean;
  onChangeLength: (seconds: number) => void;
  onToggleChime: () => void;
  onSkip: () => void;
};

/** Full-screen countdown between sets. */
export function RestOverlay({ secondsLeft, restSecs, chimeMuted, onChangeLength, onToggleChime, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-7 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Rest timer">
      <div className="w-full max-w-sm text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Rest between sets</p>
        <p className="mt-4 text-7xl font-semibold tabular-nums text-foreground" role="timer" aria-label={`${secondsLeft} seconds remaining`}>
          {formatClock(secondsLeft)}
        </p>
        <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={restSecs} aria-valuenow={restSecs - secondsLeft} aria-label="Rest progress">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${Math.min(100, ((restSecs - secondsLeft) / restSecs) * 100)}%` }} />
        </div>
        <div className="mt-7 flex justify-center gap-2" role="radiogroup" aria-label="Rest length">
          {REST_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={restSecs === s}
              onClick={() => onChangeLength(s)}
              className={`h-11 rounded-full border-2 px-4 text-sm font-semibold transition ${restSecs === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
            >
              {s}s
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={!chimeMuted}
          onClick={onToggleChime}
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-border bg-card px-5 text-sm font-semibold text-muted-foreground transition hover:border-primary/60 hover:text-primary"
        >
          {chimeMuted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4 text-primary" aria-hidden="true" />}
          {chimeMuted ? "Chime off" : "Chime on"}
        </button>
        <Button type="button" variant="link" onClick={onSkip} className="mt-3 block w-full text-base text-muted-foreground hover:text-primary">
          Skip Rest
        </Button>
      </div>
    </div>
  );
}
