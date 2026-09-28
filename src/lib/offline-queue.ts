// Offline set queue ("basement gym" support). Browser-only: call from effects or handlers.
import { useEffect, useState } from "react";
import type { CachedSet } from "./active-session";

export const OFFLINE_QUEUE_KEY = "gymbuddy_offline_queue";
const EVENT = "gymbuddy-offline-queue";

export function readOfflineQueue(): CachedSet[] {
  if (typeof window === "undefined") return [];
  try {
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? "[]");
    return Array.isArray(q) ? (q as CachedSet[]) : [];
  } catch {
    return [];
  }
}

export function writeOfflineQueue(q: CachedSet[]) {
  try {
    if (q.length === 0) localStorage.removeItem(OFFLINE_QUEUE_KEY);
    else localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Live connectivity + queued-set count. */
export function useOfflineStatus() {
  const [online, setOnline] = useState(true);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setCount(readOfflineQueue().length);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    const id = window.setInterval(update, 3000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
      window.clearInterval(id);
    };
  }, []);
  return { online, count };
}
