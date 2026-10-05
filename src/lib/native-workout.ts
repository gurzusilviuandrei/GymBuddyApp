// Phone features the workout screen relies on: haptics, the rest-over alert when
// the app is in the background or the screen is locked, and keeping the screen on.
// Every function is safe to call in a browser, where it falls back or does nothing.
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { isNativeApp } from "./platform";

// ── Haptics ─────────────────────────────────────────────────────────────────

const WEB_PATTERNS: Record<"tap" | "success" | "restOver", number | number[]> = { tap: 50, success: [40, 60, 40], restOver: [120, 80, 120] };

/** tap: a set logged · success: a personal record · restOver: rest has finished. */
export function haptic(kind: keyof typeof WEB_PATTERNS) {
  if (!isNativeApp) {
    try {
      navigator.vibrate?.(WEB_PATTERNS[kind]);
    } catch {
      /* unsupported */
    }
    return;
  }
  const run =
    kind === "tap"
      ? Haptics.impact({ style: ImpactStyle.Medium })
      : Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning });
  void run.catch(() => {});
}

// ── Rest timer with the screen locked ───────────────────────────────────────

// Native Android module (android/app/.../RestTimerService.java): a live countdown in
// the notification shade and lock screen, then an on-time alert when rest is over.
interface RestTimerPlugin {
  ensurePermission(): Promise<{ granted: boolean }>;
  start(options: { endsAt: number }): Promise<void>;
  stop(): Promise<void>;
}
const RestTimer = registerPlugin<RestTimerPlugin>("RestTimer");
const hasRestTimer = isNativeApp && Capacitor.getPlatform() === "android";

/** Ask once, in context, for permission to show the countdown and alert. */
export async function prepareRestAlerts(): Promise<boolean> {
  if (!hasRestTimer) return false;
  try {
    return (await RestTimer.ensurePermission()).granted;
  } catch {
    return false;
  }
}

/** Start (or move) the lock-screen countdown so rest ends at `endsAt` (ms). */
export async function startRestTimer(endsAt: number) {
  if (!hasRestTimer || endsAt <= Date.now()) return;
  await RestTimer.start({ endsAt }).catch(() => {
    /* the in-app timer still works */
  });
}

/** Clear the countdown and any rest-over alert (rest skipped, finished or left). */
export async function stopRestTimer() {
  if (!hasRestTimer) return;
  await RestTimer.stop().catch(() => {});
}

// ── Keep the screen on ──────────────────────────────────────────────────────

type Sentinel = { release: () => Promise<void> };

/**
 * Keeps the screen on until the returned function is called. Native on phones;
 * the Screen Wake Lock API in browsers, re-acquired whenever the tab returns.
 */
export function keepScreenOn(): () => void {
  if (isNativeApp) {
    void KeepAwake.keepAwake().catch(() => {});
    return () => void KeepAwake.allowSleep().catch(() => {});
  }
  const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
  if (!nav.wakeLock) return () => {};
  let lock: Sentinel | null = null;
  let active = true;
  const acquire = async () => {
    if (!active || document.visibilityState !== "visible") return;
    try {
      lock = await nav.wakeLock!.request("screen");
      if (!active) void lock.release().catch(() => {});
    } catch {
      // Unsupported, denied or low battery — the workout still works normally.
    }
  };
  const onVisible = () => void acquire();
  void acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
  };
}
