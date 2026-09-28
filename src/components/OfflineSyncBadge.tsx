import { useEffect, useRef, useState } from "react";
import { useOfflineStatus } from "@/lib/offline-queue";

/** Subtle connectivity row: flashing warning offline, brief green check after syncing. */
export function OfflineSyncBadge({ className = "" }: { className?: string }) {
  const { online, count } = useOfflineStatus();
  const [showSynced, setShowSynced] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    const pending = !online || count > 0;
    if (wasPending.current && !pending) {
      setShowSynced(true);
      const t = window.setTimeout(() => setShowSynced(false), 3000);
      wasPending.current = false;
      return () => window.clearTimeout(t);
    }
    if (pending) {
      wasPending.current = true;
      setShowSynced(false);
    }
    return undefined;
  }, [online, count]);

  if (!online) {
    return (
      <p role="status" className={`animate-pulse rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-foreground ${className}`}>
        ⚠️ Offline — {count} {count === 1 ? "set" : "sets"} saved locally. Will sync automatically when reconnected.
      </p>
    );
  }
  if (count > 0) {
    return (
      <p role="status" className={`animate-pulse rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary ${className}`}>
        Syncing {count} {count === 1 ? "set" : "sets"}…
      </p>
    );
  }
  if (showSynced) {
    return (
      <p role="status" className={`rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary animate-fade-in ${className}`}>
        ✓ Connected & Synced
      </p>
    );
  }
  return null;
}
