import { useEffect, useState } from "react";
import { Check, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TIPS = [
  { icon: "💧", title: "Hydration Target", text: "Aim for an extra 500ml of water today to flush out lactic acid." },
  { icon: "💤", title: "Sleep Focus", text: "Prioritize 7-8 hours of quality rest tonight for optimal muscle repair." },
  { icon: "🍳", title: "Protein Intake", text: "Keep your nutrition steady to rebuild muscle fibers." },
];

const STRETCHES = [
  { name: "Child's Pose", cue: "Knees wide, sink hips to heels, arms long. Breathe slowly · ~1.5 min" },
  { name: "Cat-Cow", cue: "On all fours, round then arch your spine with each breath · ~1.5 min" },
  { name: "World's Greatest Stretch", cue: "Lunge forward, elbow to instep, rotate arm to the sky. Alternate sides · ~2 min" },
];

const TOTAL = 5 * 60;

export function RecoveryModeCard({ onTrainAnyway }: { onTrainAnyway: () => void }) {
  const [done, setDone] = useState<boolean[]>([false, false, false]);
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="rounded-lg border border-primary/60 bg-card p-6 shadow-neon animate-fade-in">
      <p className="text-xs font-semibold uppercase text-primary">Rest Day</p>
      <h3 className="mt-3 text-xl font-semibold">Rest & Recovery Mode 🛡️</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Muscle tissue repairs and grows during rest, Bro. You earned today off!
      </p>
      <ul className="mt-6 space-y-3">
        {TIPS.map((t, i) => (
          <li key={t.title}>
            <button
              type="button"
              onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
              aria-pressed={done[i]}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${done[i] ? "border-primary/60 bg-primary/10" : "border-border bg-background"}`}
            >
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${done[i] ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}>
                {done[i] && <Check size={12} strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className="text-sm">
                <span className="font-semibold text-foreground">{t.icon} {t.title}:</span>{" "}
                <span className="text-muted-foreground">{t.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        onClick={() => setGuideOpen(true)}
        className="mt-6 h-12 w-full rounded-lg border-primary/60 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-primary"
      >
        Start 5-Min Recovery Mobility Guide
      </Button>
      <button type="button" onClick={onTrainAnyway} className="mt-4 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline">
        Feeling great? Train anyway
      </button>
      {guideOpen && <MobilityGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function MobilityGuide({ onClose }: { onClose: () => void }) {
  const [left, setLeft] = useState(TOTAL);
  const [running, setRunning] = useState(true);
  const [checked, setChecked] = useState<boolean[]>([false, false, false]);

  // Lock background scrolling while the guide is open; restore on close.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      scrollY: window.scrollY,
    };
    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${prev.scrollY}px`;
    body.style.width = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, prev.scrollY);
    };
  }, []);

  const finished = left <= 0;
  useEffect(() => {
    if (!running || finished) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, finished]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const r = 52;
  const circ = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Recovery mobility guide">
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-primary/50 bg-card shadow-neon animate-fade-in sm:max-h-[88dvh] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-border/60 px-6 pb-4 pt-5">
          <h3 className="text-lg font-semibold">5-Min Recovery Mobility</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-1">

        <div className="mt-5 flex flex-col items-center">
          <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - left / TOTAL)} transform="rotate(-90 64 64)" style={{ transition: "stroke-dashoffset 1s linear" }} />
            <text x="64" y="72" textAnchor="middle" fill="var(--foreground)" fontSize="24" fontWeight="700">{mm}:{ss}</text>
          </svg>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{left === 0 ? "Done! Nice and loose, Bro." : running ? "Stay loose, breathe easy." : "Paused"}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setRunning((v) => !v)} disabled={left === 0} className="border-primary/60 text-primary hover:bg-primary/10 hover:text-primary">
              {running ? <Pause size={14} /> : <Play size={14} />} <span className="ml-1">{running ? "Pause" : "Resume"}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setLeft(TOTAL); setRunning(true); }}>
              <RotateCcw size={14} /> <span className="ml-1">Reset</span>
            </Button>
          </div>
        </div>
        <ul className="mt-6 space-y-3">
          {STRETCHES.map((s, i) => (
            <li key={s.name}>
              <button type="button" onClick={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))} aria-pressed={checked[i]}
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left ${checked[i] ? "border-primary/60 bg-primary/10" : "border-border bg-background"}`}>
                <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${checked[i] ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"}`}>
                  {checked[i] && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold text-foreground">{s.name}</span>
                  <span className="text-muted-foreground">{s.cue}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        </div>
      </div>

    </div>
  );
}
