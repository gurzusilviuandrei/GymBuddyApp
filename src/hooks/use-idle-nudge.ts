import { useEffect, useState } from "react";

const IDLE_MS = 3 * 60 * 1000;

// Shows a nudge after 3 minutes with no activity. Any change in `resetKeys`
// (a set logged, rest closed, exercise changed) restarts the countdown.
export function useIdleNudge(enabled: boolean, resetKeys: unknown[]) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    if (!enabled) return;
    const t = window.setTimeout(() => setShow(true), IDLE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...resetKeys]);
  return { show, dismiss: () => setShow(false) };
}
