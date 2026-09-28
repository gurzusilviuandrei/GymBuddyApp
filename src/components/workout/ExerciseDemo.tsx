import { useEffect, useRef, useState } from "react";
import { Expand, Pause, Play, X } from "lucide-react";
import { getExerciseFrames } from "@/lib/exercise-media";

const FRAME_MS = 900;
const PAUSED_KEY = "gymbuddy-demo-paused";

function readPaused(): boolean {
  try {
    return window.localStorage.getItem(PAUSED_KEY) === "1";
  } catch {
    return false;
  }
}

type Cue = readonly [string, string];

function PlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-10 text-primary" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

/** Cross-fading two-frame loop: silent, never interrupts the user's music. */
function Loop({ frames, name, ready, paused, onReady }: { frames: readonly [string, string]; name: string; ready: boolean; paused: boolean; onReady: () => void }) {
  const [flip, setFlip] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const firstRef = useRef<HTMLImageElement>(null);

  // Cached images can finish loading before hydration attaches onLoad.
  useEffect(() => {
    if (firstRef.current?.complete) onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames[0]]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || !ready || paused || hidden) return;
    const id = window.setInterval(() => setFlip((f) => !f), FRAME_MS);
    return () => window.clearInterval(id);
  }, [reduced, ready, paused, hidden]);

  return (
    <>
      {frames.map((src, i) => (
        <img
          key={src}
          ref={i === 0 ? firstRef : undefined}
          src={src}
          alt={i === 0 ? `${name} starting position` : `${name} finishing position`}
          loading="lazy"
          decoding="async"
          onLoad={i === 0 ? onReady : undefined}
          onError={i === 0 ? onReady : undefined}
          className="absolute inset-0 size-full object-contain transition-opacity duration-300 ease-in-out"
          style={{ opacity: ready && (i === 1) === flip ? 1 : 0 }}
        />
      ))}
    </>
  );
}

export function ExerciseDemo({
  exerciseId,
  name,
  cues,
}: {
  exerciseId: string | undefined;
  name: string | undefined;
  cues: readonly Cue[];
}) {
  const frames = getExerciseFrames(exerciseId);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);

  // Read after mount so server and browser render the same icon first.
  useEffect(() => { setPaused(readPaused()); }, []);

  const togglePaused = () => {
    setPaused((p) => {
      const next = !p;
      try {
        window.localStorage.setItem(PAUSED_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    setReady(false);
    setOpen(false);
  }, [exerciseId]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!frames) {
    return (
      <div
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-5 rounded-3xl border-2 border-border bg-card"
        role="img"
        aria-label={`${name ?? "Exercise"} demonstration`}
      >
        <PlaceholderIcon />
        <p className="text-base font-medium tracking-wide text-muted-foreground">
          {name ? `${name} Demonstration` : "Loading your workout…"}
        </p>
      </div>
    );
  }

  const label = name ?? "Exercise";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        aria-label={`Expand ${label} demonstration`}
        className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden rounded-3xl border-2 border-border bg-card"
      >
        {!ready && (
          <div className="absolute inset-0 animate-pulse bg-muted/40" aria-hidden="true" />
        )}
        <Loop frames={frames} name={label} ready={ready} paused={paused} onReady={() => setReady(true)} />
        <span className="absolute bottom-3 left-3 rounded-full border border-primary/50 bg-background/80 px-3 py-1 text-xs font-semibold text-primary backdrop-blur">
          Form Demo
        </span>
        <span className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur">
          <Expand className="size-4" aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePaused(); }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={paused ? `Play ${label} demonstration` : `Pause ${label} demonstration`}
          aria-pressed={paused}
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} form guide`}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background/95 p-5 backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <div className="mx-auto w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold leading-tight text-foreground">{label}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close form guide"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-primary/40 bg-card">
              <Loop frames={frames} name={label} ready paused={paused} onReady={() => {}} />
            </div>
            <ul className="mt-5 space-y-5 pb-8">
              {cues.map(([cueLabel, cue]) => (
                <li key={cueLabel} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>
                    <strong className="block font-semibold text-foreground">{cueLabel}</strong>
                    <span className="text-muted-foreground">{cue}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
