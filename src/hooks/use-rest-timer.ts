import { useEffect, useState } from "react";
import { isChimeMuted, playRestOverChime, setChimeMuted, unlockChime } from "@/lib/rest-chime";
import { haptic, prepareRestAlerts, startRestTimer, stopRestTimer } from "@/lib/native-workout";
import { restRemaining, shiftRestEnd } from "@/lib/workout-logic";
import { readRestLength, rememberRestLength } from "@/lib/rest-length";

/**
 * Rest between sets: the on-screen countdown, the chime and buzz when it ends, and
 * a native lock-screen countdown that alerts on time while the phone is locked.
 * `defaultSeconds` applies until the member picks a length; after that their choice is remembered.
 */
export function useRestTimer(defaultSeconds: number) {
  const [initialSeconds] = useState(() => readRestLength() ?? defaultSeconds);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [restSecs, setRestSecs] = useState(initialSeconds);
  const [chimeMuted, setChimeMutedState] = useState(false);

  // Audio needs a real tap before it is allowed to play on phones.
  useEffect(() => {
    setChimeMutedState(isChimeMuted());
    const arm = () => unlockChime();
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("touchstart", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("touchstart", arm);
    };
  }, []);

  useEffect(() => {
    if (restEndsAt === null) return;
    // Only re-render when the displayed second actually changes, so the rest
    // countdown never re-renders the tracker four times a second.
    let shown = -1;
    const tick = () => {
      const remaining = restRemaining(restEndsAt, Date.now());
      if (remaining !== shown) {
        shown = remaining;
        setSecondsLeft(remaining);
      }
      if (remaining === 0) {
        setRestEndsAt(null);
        // Chime for headphones, buzz for pockets — rest is over.
        playRestOverChime();
        haptic("restOver");
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [restEndsAt]);

  // A locked phone pauses the in-app countdown, so mirror it in a native countdown
  // that alerts on time; it follows rest-length changes and clears when rest ends.
  useEffect(() => {
    void (restEndsAt === null ? stopRestTimer() : startRestTimer(restEndsAt));
  }, [restEndsAt]);
  useEffect(() => () => void stopRestTimer(), []);

  return {
    resting: restEndsAt !== null,
    secondsLeft,
    restSecs,
    chimeMuted,
    start() {
      // First rest: ask (once) to alert when it's over, even with the phone locked.
      void prepareRestAlerts();
      setSecondsLeft(restSecs);
      setRestEndsAt(Date.now() + restSecs * 1000);
    },
    skip() {
      setRestEndsAt(null);
    },
    changeLength(seconds: number) {
      setRestEndsAt((end) => (end === null ? end : shiftRestEnd(end, restSecs, seconds)));
      setRestSecs(seconds);
      rememberRestLength(seconds);
    },
    toggleChime() {
      const next = !chimeMuted;
      setChimeMuted(next);
      setChimeMutedState(next);
      if (!next) {
        unlockChime();
        playRestOverChime();
      }
    },
  };
}
