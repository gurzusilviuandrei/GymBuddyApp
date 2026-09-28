/**
 * Rest-timer chime: a soft two-note bell, synthesised in the browser so there is
 * no audio file to download and it plays straight through headphones.
 *
 * Mobile browsers only allow audio that started from a real tap, so the audio
 * engine is created (and resumed) on the first touch anywhere in the app.
 */

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = "gymbuddy-chime-muted";

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { webkitAudioContext?: Ctor };
  return window.AudioContext ?? w.webkitAudioContext;
}

export function isChimeMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChimeMuted(next: boolean) {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* private mode — the setting just won't persist */
  }
}

/** Create/resume the audio engine. Must run inside a user gesture on iOS. */
export function unlockChime() {
  muted = isChimeMuted();
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function tone(at: number, freq: number, duration: number, peak: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  // Quick attack, gentle exponential decay: a bell, not a buzzer.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** Two rising notes marking the end of the rest period. */
export function playRestOverChime() {
  if (muted || isChimeMuted()) return;
  unlockChime();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  tone(now, 660, 0.45, 0.13); // E5
  tone(now + 0.18, 880, 0.55, 0.11); // A5
}
