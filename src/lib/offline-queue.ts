// Offline set queue ("basement gym" support). Browser-only: call from effects or handlers.
import { useEffect, useState } from "react";
import type { CachedSet } from "./active-session";
import { durableStorage } from "@/lib/durable-storage";

export const OFFLINE_QUEUE_KEY = "gymbuddy_offline_queue";
export const PENDING_DELETES_KEY = "gymbuddy_pending_deletes";
export const QUEUE_EVENT = "gymbuddy-offline-queue";
const EVENT = QUEUE_EVENT;

export function readOfflineQueue(): CachedSet[] {
  if (typeof window === "undefined") return [];
  try {
    const q = JSON.parse(durableStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
    return Array.isArray(q) ? (q as CachedSet[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(q: CachedSet[]) {
  try {
    if (q.length === 0) durableStorage.removeItem(OFFLINE_QUEUE_KEY);
    else durableStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Deletions that still have to reach the account. Kept in durable storage (not a
 * React ref) so closing the tab offline can never resurrect a removed set.
 */
export function readPendingDeletes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(durableStorage.getItem(PENDING_DELETES_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as unknown[]).filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writePendingDeletes(ids: string[]) {
  try {
    if (ids.length === 0) durableStorage.removeItem(PENDING_DELETES_KEY);
    else durableStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addPendingDelete(id: string) {
  writePendingDeletes([...readPendingDeletes(), id]);
}

export function removePendingDelete(id: string) {
  writePendingDeletes(readPendingDeletes().filter((x) => x !== id));
}

/**
 * Cross-tab mutual exclusion for the sync loop. Two tabs flushing the same
 * queue could otherwise write an older copy of a set over a newer edit.
 * Web Locks where available, with a short time-boxed localStorage fallback.
 */
const LOCK_KEY = "gymbuddy_sync_lock";
const LOCK_TTL_MS = 30_000;

type Locks = { request: (name: string, options: { ifAvailable: boolean }, fn: (lock: unknown) => Promise<void>) => Promise<void> };

export async function withSyncLock(run: () => Promise<void>): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: Locks }).locks;
  if (locks?.request) {
    let ran = false;
    await locks.request("gymbuddy-offline-sync", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      ran = true;
      await run();
    });
    return ran;
  }
  // Fallback: a stale lock older than the TTL is treated as abandoned.
  try {
    const held = Number(localStorage.getItem(LOCK_KEY) ?? "0");
    if (Number.isFinite(held) && Date.now() - held < LOCK_TTL_MS) return false;
    localStorage.setItem(LOCK_KEY, String(Date.now()));
  } catch {
    /* storage blocked — run unguarded rather than never syncing */
  }
  try {
    await run();
  } finally {
    try {
      localStorage.removeItem(LOCK_KEY);
    } catch {
      /* ignore */
    }
  }
  return true;
}

/** Live connectivity + queued-set count. */
export function useOfflineStatus() {
  const [online, setOnline] = useState(true);
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Event-driven only: queue writes dispatch EVENT, so no background polling is needed.
    const update = () => {
      setOnline(navigator.onLine);
      setCount(readOfflineQueue().length);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return { online, count };
}
