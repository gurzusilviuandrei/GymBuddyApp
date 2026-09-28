import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import { ArrowRightLeft, Camera, Check, Zap, CloudOff, Download, Pencil, Share2, Trash2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readActiveSession, writeActiveSession, clearActiveSession, type CachedSet } from "@/lib/active-session";
import { getDayOneWorkout, getAlternativeOptions, getLastLog, getUserStats, logWorkoutSet, completeWorkout, updateWorkoutSet, deleteWorkoutSet } from "@/lib/gym.functions";
import { MachineAlignment } from "@/components/workout/MachineAlignment";
import { writeOfflineQueue } from "@/lib/offline-queue";
import { OfflineSyncBadge } from "@/components/OfflineSyncBadge";
import { PlateVisualizer, Stepper, WarmUpCalculator } from "@/components/workout/GymTools";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIdleNudge } from "@/hooks/use-idle-nudge";
import { createBroCardBlob, downloadBroCard, type BroCardStats } from "@/lib/bro-card";

export const Route = createFileRoute("/_authenticated/workout")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "premade" || search["mode"] === "custom" ? search["mode"] : undefined,
    sore: search["sore"] === "fresh" || search["sore"] === "little" || search["sore"] === "super" ? search["sore"] : undefined,
  }) as { mode?: "premade" | "custom"; sore?: "fresh" | "little" | "super" },
  head: () => ({
    meta: [
      { title: "Active Workout — GymBuddy" },
      {
        name: "description",
        content:
          "Follow along with your guided exercise video, log your sets, and swap exercises when machines are busy.",
      },
      { property: "og:title", content: "Active Workout — GymBuddy" },
      {
        property: "og:description",
        content:
          "Follow along with your guided exercise video, log your sets, and swap exercises when machines are busy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workout,
});

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-10 text-primary"
      aria-hidden="true"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

const REST_OPTIONS = [45, 60, 90, 120] as const;
const SYNC_TIMEOUT_MS = 6000;
function withTimeout<T>(p: Promise<T>, ms = SYNC_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}
type Ex = { id: string; name: string; instructions: string; setup_cue: string | null; position_cue: string | null; movement_cue: string | null; video_url: string | null; alternative_exercise_id: string | null };

function Workout() {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [logging, setLogging] = useState(false);
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [pr, setPr] = useState<{ weight: number; name: string } | null>(null);
  const prShown = useRef(new Set<string>());
  useEffect(() => {
    if (!pr) return;
    const t = setTimeout(() => setPr(null), 3500);
    return () => clearTimeout(t);
  }, [pr]);
  const [lastLog, setLastLog] = useState<{ weight_kg: number; reps_completed: number } | null>(null);
  const logSet = useServerFn(logWorkoutSet);
  const fetchWorkout = useServerFn(getDayOneWorkout);
  const fetchOptions = useServerFn(getAlternativeOptions);
  const [swapOpen, setSwapOpen] = useState(false);
  const fetchLastLog = useServerFn(getLastLog);
  const [swapped, setSwapped] = useState<Ex | null>(null);
  const [swapping, setSwapping] = useState(false);
  const finish = useServerFn(completeWorkout);
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<{ sets: number; volume: number; durationMinutes: number; weeklyWorkouts: number } | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const { mode, sore } = Route.useSearch();
  const superSore = sore === "super";
  const [restSecs, setRestSecs] = useState<number>(superSore ? 120 : 90);
  const loggedSetIds = useRef<string[]>([]);
  const usedExerciseIds = useRef<Record<number, string>>({});
  const swappedMap = useRef<Record<number, Ex>>({});
  const [restored, setRestored] = useState(false);
  const [sets, setSets] = useState<CachedSet[]>([]);
  const setsRef = useRef<CachedSet[]>([]);
  const pendingDeletes = useRef<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const updateSet = useServerFn(updateWorkoutSet);
  const removeSet = useServerFn(deleteWorkoutSet);
  const fetchStats = useServerFn(getUserStats);
  const [broCardUrl, setBroCardUrl] = useState<string | null>(null);
  const [broCardBlob, setBroCardBlob] = useState<Blob | null>(null);
  const [creatingCard, setCreatingCard] = useState(false);

  // Single source of truth for logged sets; ids feed the completion totals.
  const commitSets = (updater: (prev: CachedSet[]) => CachedSet[]) => {
    const next = updater(setsRef.current);
    setsRef.current = next;
    loggedSetIds.current = next.flatMap((x) => (x.id ? [x.id] : []));
    setSets(next);
  };

  useEffect(() => {
    if (restEndsAt === null) return;
    // Only re-render when the displayed second actually changes, so the rest
    // countdown never re-renders the tracker four times a second.
    let shown = -1;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      if (remaining !== shown) {
        shown = remaining;
        setSecondsLeft(remaining);
      }
      if (remaining === 0) setRestEndsAt(null);
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [restEndsAt]);

  // Keep the screen awake while training; released on finish or leaving the page.
  useEffect(() => {
    if (complete) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
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
    // The browser drops the lock when the tab is hidden, so re-acquire on return.
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [complete]);

  // Identity comes from the signed-in session on the server, so this loads even
  // when the local copy of the profile is missing. `mode` picks the program:
  // premade plan, saved custom routine, or the active default.
  const { data: workout, isLoading } = useQuery({
    queryKey: ["day-one-workout", mode ?? "auto"],
    queryFn: () => fetchWorkout({ data: { mode } }),
  });


  const session = workout?.exercises ?? [];
  // Auto-regulate: 3+ sets → 2 sets; otherwise keep sets and drop target reps by 2.
  const baseSets = workout?.target_sets ?? 3;
  const baseReps = workout?.target_reps ?? 10;
  const targetSets = superSore && baseSets >= 3 ? 2 : baseSets;
  const targetReps = superSore && baseSets < 3 ? Math.max(1, baseReps - 2) : baseReps;
  const primary = session[index];
  const exercise = swapped ?? primary;
  const setsDone = setNumber > targetSets;
  const isLastExercise = index >= session.length - 1;

  // Restore an in-progress session once the program is known.
  useEffect(() => {
    if (!workout || restored) return;
    const cached = readActiveSession();
    if (cached && cached.is_custom_workout === Boolean(workout.is_custom) && cached.current_exercise_index < workout.exercises.length) {
      setIndex(cached.current_exercise_index);
      setSetNumber(cached.current_set_number);
      setStartedAt(cached.session_start_time);
      swappedMap.current = cached.swapped_exercises_map as Record<number, Ex>;
      setSwapped((cached.swapped_exercises_map[cached.current_exercise_index] as Ex | undefined) ?? null);
      loggedSetIds.current = cached.logged_set_ids;
      if (cached.logged_sets?.length) commitSets(() => cached.logged_sets!);
      usedExerciseIds.current = cached.used_exercise_ids;
      toast.success(`Resumed: Exercise ${cached.current_exercise_index + 1} of ${workout.exercises.length}`);
    }
    setRestored(true);
  }, [workout, restored]);

  // Mirror progress to local storage after every change (once something happened).
  useEffect(() => {
    if (!restored || !workout || complete) return;
    const started = setsRef.current.length > 0 || loggedSetIds.current.length > 0 || index > 0 || Object.keys(swappedMap.current).length > 0;
    if (!started) return;
    writeActiveSession({
      current_exercise_index: index,
      current_set_number: setNumber,
      is_custom_workout: Boolean(workout.is_custom),
      swapped_exercises_map: swappedMap.current,
      session_start_time: startedAt,
      total_exercises: session.length,
      logged_set_ids: loggedSetIds.current,
      used_exercise_ids: usedExerciseIds.current,
      logged_sets: setsRef.current,
    });
  }, [restored, workout, complete, index, setNumber, swapped, startedAt, session.length, sets]);

  // Exit guard: only while a session is actually in progress.
  const sessionActive = !complete && !finishing && (sets.length > 0 || index > 0);
  const blocker = useBlocker({
    shouldBlockFn: () => sessionActive,
    enableBeforeUnload: () => sessionActive,
    withResolver: true,
  });

  const syncSet = async (key: string) => {
    const item = setsRef.current.find((x) => x.key === key);
    if (!item || item.id) return;
    // No signal: keep it local instantly instead of waiting for a timeout.
    if (!navigator.onLine) {
      commitSets((prev) => prev.map((x) => (x.key === key ? { ...x, status: "local" } : x)));
      return;
    }
    commitSets((prev) => prev.map((x) => (x.key === key ? { ...x, status: "syncing" } : x)));
    try {
      const row = await withTimeout(
        logSet({ data: { exercise_id: item.exercise_id, weight_kg: item.weight_kg, reps_completed: item.reps, set_number: item.set_number, client_key: item.key } }),
      );
      const current = setsRef.current.find((x) => x.key === key);
      if (!current) {
        // Deleted while syncing — remove the server copy too.
        removeSet({ data: { id: row.id } }).catch(() => pendingDeletes.current.push(row.id));
        return;
      }
      commitSets((prev) => prev.map((x) => (x.key === key ? { ...x, id: row.id, status: "saved" } : x)));
      if (row.is_personal_record && !prShown.current.has(key)) {
        prShown.current.add(key);
        const name = session.find((e) => e.id === item.exercise_id)?.name ?? (exercise?.id === item.exercise_id ? exercise.name : "lift");
        try { navigator.vibrate?.(50); } catch { /* unsupported */ }
        setPr({ weight: item.weight_kg, name });
      }
      if (current.weight_kg !== item.weight_kg || current.reps !== item.reps) {
        updateSet({ data: { id: row.id, weight_kg: current.weight_kg, reps_completed: current.reps } }).catch(() => {});
      }
    } catch {
      commitSets((prev) => prev.map((x) => (x.key === key ? { ...x, status: "local" } : x)));
    }
  };

  const kickSyncRef = useRef<() => void>(() => {});

  // Mirror every unsynced set into the offline queue so the badge (and Home) can see it,
  // and wake the retry loop whenever a set is still waiting to reach the account.
  useEffect(() => {
    const unsynced = sets.filter((x) => x.status !== "saved");
    writeOfflineQueue(unsynced);
    if (unsynced.some((x) => x.status === "local")) kickSyncRef.current();
  }, [sets]);


  // Background sync: retry unsaved sets on reconnect, with backoff. No timer runs
  // while every set is saved, so an idle tracker screen stays completely quiet.
  useEffect(() => {
    let running = false;
    let timer = 0;
    let delay = 5000;
    let cancelled = false;

    const schedule = () => {
      if (cancelled || timer) return;
      timer = window.setTimeout(() => { timer = 0; void retry(); }, delay);
    };

    const retry = async () => {
      if (cancelled || running) return;
      const pending = setsRef.current.filter((s) => s.status === "local");
      if (pending.length === 0) { delay = 5000; return; }
      if (!navigator.onLine) { schedule(); return; }
      running = true;
      try {
        for (const x of pending) {
          if (!navigator.onLine) break;
          await syncSet(x.key);
        }
      } finally {
        running = false;
        const left = setsRef.current.filter((s) => s.status === "local").length;
        delay = left >= pending.length ? Math.min(delay * 2, 60000) : 5000;
        if (left > 0) schedule();
      }
    };

    const kick = () => { delay = 5000; void retry(); };
    kickSyncRef.current = kick;
    window.addEventListener("online", kick);

    return () => {
      cancelled = true;
      window.removeEventListener("online", kick);
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleDeleteSet = (key: string) => {
    const target = setsRef.current.find((x) => x.key === key);
    if (!target) return;
    commitSets((prev) => {
      let n = 0;
      return prev
        .filter((x) => x.key !== key)
        .map((x) => (x.exercise_index === target.exercise_index ? { ...x, set_number: ++n } : x));
    });
    if (target.exercise_index === index) setSetNumber((n) => Math.max(1, n - 1));
    if (editingKey === key) setEditingKey(null);
    if (target.id) {
      const id = target.id;
      removeSet({ data: { id } }).catch(() => pendingDeletes.current.push(id));
    }
    toast.success("Set removed");
  };

  const startEdit = (x: CachedSet) => {
    setEditingKey(x.key);
    setEditWeight(String(x.weight_kg));
    setEditReps(String(x.reps));
  };

  const saveEdit = () => {
    const w = Number(editWeight);
    const r = Number(editReps);
    if (editWeight === "" || !Number.isFinite(w) || w < 0 || w > 1000 || !Number.isInteger(r) || r < 1 || r > 100) {
      toast.error("Enter a weight (0–1000 kg) and 1–100 reps.");
      return;
    }
    const target = setsRef.current.find((x) => x.key === editingKey);
    if (!target) return setEditingKey(null);
    const before = { weight_kg: target.weight_kg, reps: target.reps };
    commitSets((prev) => prev.map((x) => (x.key === target.key ? { ...x, weight_kg: w, reps: r } : x)));
    setEditingKey(null);
    if (target.id) {
      updateSet({ data: { id: target.id, weight_kg: w, reps_completed: r } }).catch(() => {
        commitSets((prev) => prev.map((x) => (x.key === target.key ? { ...x, ...before } : x)));
        toast.error("Couldn't save that correction. Try again.");
      });
    }
  };

  useEffect(() => {
    if (exercise?.name) document.title = `${exercise.name} — GymBuddy`;
  }, [exercise?.name]);

  useEffect(() => {
    setLastLog(null);
    if (!exercise) return;
    let cancelled = false;
    fetchLastLog({ data: { exercise_id: exercise.id } })
      .then((row) => !cancelled && setLastLog(row))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exercise?.id]);



  const handleNext = async () => {
    if (isLastExercise) {
      if (finishing) return;
      setFinishing(true);
      // Push any locally saved sets and pending deletions before totalling.
      await Promise.all(setsRef.current.filter((x) => !x.id).map((x) => syncSet(x.key)));
      if (setsRef.current.some((x) => !x.id)) {
        setFinishing(false);
        toast.error("Some sets are only saved locally. Check your connection and try again.");
        return;
      }
      await Promise.all(pendingDeletes.current.splice(0).map((id) => removeSet({ data: { id } }).catch(() => {})));
      setComplete(true);
      clearActiveSession();
      try {
        const doneIds = session.map((e, i) => usedExerciseIds.current[i] ?? e.id);
        const saved = await finish({
          data: {
            program_type: workout?.is_custom ? "custom" : "premade",
            exercise_ids: doneIds,
            log_ids: loggedSetIds.current,
            started_at: startedAt,
            split_day: workout?.is_custom ? undefined : workout?.split_day,
            auto_regulated: superSore,
          },
        });
        const freshStats = await fetchStats({ data: { tz_offset: new Date().getTimezoneOffset() } });
        const startedMs = new Date(startedAt).getTime();
        const durationMinutes = Math.max(1, Math.round((Date.now() - startedMs) / 60_000));
        setSummary({ sets: saved.sets, volume: saved.volume, durationMinutes, weeklyWorkouts: freshStats.completedWorkouts });
        queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        queryClient.invalidateQueries({ queryKey: ["workout-history"] });
        // Next split day loads when Home mounts; don't swap this screen's plan now.
        queryClient.invalidateQueries({ queryKey: ["day-one-workout"], refetchType: "none" });
        setComplete(true);
      } catch {
        setComplete(false);
        toast.error("Couldn't save your workout. Try again.");
      } finally {
        setFinishing(false);
      }
      return;
    }
    setIndex((i) => i + 1);
    setSwapped(null);
    setSetNumber(1);
    setWeight("");
    setReps("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => () => {
    if (broCardUrl) URL.revokeObjectURL(broCardUrl);
  }, [broCardUrl]);

  const makeCard = async () => {
    if (!summary || creatingCard) return null;
    setCreatingCard(true);
    try {
      const stats: BroCardStats = {
        date: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
        durationMinutes: summary.durationMinutes,
        volumeKg: summary.volume,
        weeklyWorkouts: summary.weeklyWorkouts,
      };
      const blob = await createBroCardBlob(stats);
      if (broCardUrl) URL.revokeObjectURL(broCardUrl);
      const url = URL.createObjectURL(blob);
      setBroCardBlob(blob);
      setBroCardUrl(url);
      return blob;
    } catch {
      toast.error("Couldn't create your Bro Card. Try again.");
      return null;
    } finally {
      setCreatingCard(false);
    }
  };

  const handleShareCard = async () => {
    const blob = broCardBlob ?? await makeCard();
    if (!blob) return;
    const file = new File([blob], "gymbuddy-bro-card.png", { type: "image/png" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({ files: [file], title: "My GymBuddy Bro Card" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
  };

  const handleDownloadCard = async () => {
    const blob = broCardBlob ?? await makeCard();
    if (blob) downloadBroCard(blob);
  };

  const { data: swapOptions, isFetching: loadingOptions } = useQuery({
    queryKey: ["swap-options", exercise?.id],
    queryFn: () => fetchOptions({ data: { exercise_id: exercise!.id, exclude: session.map((e) => e.id) } }),
    enabled: swapOpen && Boolean(exercise),
  });

  const handleSwap = (alt: Ex) => {
    if (swapping) return;
    setSwapping(true);
    try {
      swappedMap.current = { ...swappedMap.current, [index]: alt };
      setSwapped(alt);
      setSetNumber(1);
      usedExerciseIds.current[index] = alt.id;
      toast.success(`Swapped to ${alt.name}`);
      setSwapOpen(false);
    } finally {
      setSwapping(false);
    }
  };

  const idle = useIdleNudge(!complete && restEndsAt === null && Boolean(exercise), [sets.length, restEndsAt === null, index]);

  const handleLogSet = async () => {
    if (setsDone) return handleNext();
    const w = Number(weight);
    const r = Number(reps);
    if (weight === "" || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r < 1) {
      toast.error("Enter a weight and at least 1 rep.");
      return;
    }
    if (!exercise) {
      toast.error("Your workout is still loading. Try again in a moment.");
      return;
    }
    if (logging || restEndsAt !== null) return;
    // Start at the tap, not after the network request completes.
    if (setNumber < targetSets) {
      setSecondsLeft(restSecs);
      setRestEndsAt(Date.now() + restSecs * 1000);
    }
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    commitSets((prev) => [
      ...prev,
      { key, id: null, exercise_index: index, exercise_id: exercise.id, set_number: setNumber, weight_kg: w, reps: r, status: "syncing" },
    ]);
    usedExerciseIds.current[index] = exercise.id;
    setLastLog({ weight_kg: w, reps_completed: r });
    setSetNumber((n) => n + 1);
    // Auto-fill: keep this set's numbers ready for the next one.
    setWeight(String(w));
    setReps(String(r));
    void syncSet(key);
  };

  if (complete) {
    return (
      <div className="flex min-h-dvh flex-col items-center bg-background px-7 py-14 text-center text-foreground home-enter">
        <div className="text-7xl" aria-hidden="true">🏆</div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Workout Complete!</h1>
        <p className="mt-3 text-lg text-primary">Bro Status Upgraded 🏆</p>
        <p className="mt-4 text-base text-muted-foreground">
          {summary
            ? `${session.length} exercises · ${summary.sets} sets crushed · ${summary.volume} kg lifted. Saved to your History.`
            : "Saving your workout…"}
        </p>
        {summary && (
          <>
            <section className="mt-8 w-full max-w-sm rounded-lg border-2 border-primary/60 bg-primary/5 p-5 text-left shadow-neon">
              <h2 className="font-semibold text-primary">⚡ Immediate Recovery Targets</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Great lift! To optimize muscle repair, aim to consume roughly 500ml of water and 25–30g of protein within the next 2 hours.</p>
            </section>
            <Button type="button" onClick={handleShareCard} disabled={creatingCard} className="mt-6 h-16 w-full max-w-sm text-lg font-semibold shadow-neon">
              <Camera aria-hidden="true" /> {creatingCard ? "Creating Bro Card…" : "Share My Bro Card"}
            </Button>
            <Button type="button" variant="link" onClick={handleDownloadCard} disabled={creatingCard} className="mt-2 text-muted-foreground hover:text-primary">
              <Download aria-hidden="true" /> Save to Device Photos
            </Button>
            <Button asChild variant="outline" className="mt-6 h-14 w-full max-w-sm text-base font-semibold">
              <Link to="/home">Back to Home</Link>
            </Button>
          </>
        )}
        {broCardUrl && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 px-7 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Your Bro Card preview">
            <div className="flex max-h-full w-full max-w-sm flex-col items-center">
              <div className="flex w-full items-center justify-between">
                <p className="font-semibold text-foreground">Your Bro Card</p>
                <Button type="button" variant="ghost" size="icon" onClick={() => setBroCardUrl(null)} aria-label="Close Bro Card preview"><X aria-hidden="true" /></Button>
              </div>
              <img src={broCardUrl} alt="Your GymBuddy workout Bro Card" className="mt-4 max-h-[65vh] w-auto rounded-lg border border-primary/50 shadow-neon" />
              <Button type="button" onClick={handleShareCard} className="mt-5 h-12 w-full font-semibold"><Share2 aria-hidden="true" /> Share Card</Button>
              <Button type="button" variant="outline" onClick={handleDownloadCard} className="mt-3 h-12 w-full"><Download aria-hidden="true" /> Save to Device Photos</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-7 pb-10 pt-14 text-foreground">
      {pr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6 backdrop-blur-sm animate-fade-in" onClick={() => setPr(null)}>
          <div role="alertdialog" aria-live="assertive" aria-label="New personal record" className="w-full max-w-sm rounded-2xl border-2 border-primary bg-card p-7 text-center shadow-neon" onClick={(e) => e.stopPropagation()}>
            <p className="text-5xl" aria-hidden="true">🏆</p>
            <p className="mt-4 text-2xl font-bold text-primary">New Personal Record! 🔥</p>
            <p className="mt-3 text-base leading-relaxed text-foreground">{pr.weight}kg is your heaviest {pr.name} to date, Bro!</p>
            <Button type="button" onClick={() => setPr(null)} className="mt-6 h-12 w-full rounded-lg text-base font-semibold shadow-neon">Let's Go!</Button>
          </div>
        </div>
      )}
      {idle.show && (
        <div role="status" className="fixed inset-x-4 top-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-primary/60 bg-card/95 px-4 py-3 shadow-neon backdrop-blur animate-fade-in">
          <Zap className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="flex-1 text-sm text-foreground">Ready for the next set, Bro? Let's keep your momentum going.</p>
          <button type="button" onClick={idle.dismiss} aria-label="Dismiss reminder" className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X className="size-4" aria-hidden="true" /></button>
        </div>
      )}
      <OfflineSyncBadge className="mb-4" />
      {/* Exercise video placeholder */}
      <div
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-5 rounded-3xl border-2 border-border bg-card"
        role="img"
        aria-label={`${exercise?.name ?? "Exercise"} Video Guide placeholder`}
      >
        <PlayIcon />
        <p className="text-base font-medium tracking-wide text-muted-foreground">
          {exercise ? `${exercise.name} Video Guide` : "Loading your workout…"}
        </p>
      </div>

      {/* Exercise title & target */}
      <div key={exercise?.id} className="mt-10 home-enter">
        {session.length > 0 && (
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-primary">
            Exercise {index + 1} of {session.length}
          </p>
        )}
        <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight text-foreground">
          {exercise?.name ?? "Your Workout"}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {workout ? (
            <>
              Target:{" "}
              <span className={superSore && targetSets !== baseSets ? "font-semibold text-primary" : undefined}>{targetSets} Sets</span>
              {" × "}
              <span className={superSore && targetReps !== baseReps ? "font-semibold text-primary" : undefined}>{targetReps} Reps</span>
            </>
          ) : "Loading target…"}
        </p>
        {superSore && (
          <p className="mt-3 inline-flex rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Scaled for Recovery 🛡️ · {targetSets !== baseSets ? `${baseSets}→${targetSets} sets` : `${baseReps}→${targetReps} reps`} · 120s rest
          </p>
        )}
        {exercise ? (
          <section aria-label="Exercise setup and form" className="mt-6 rounded-lg border border-border bg-card p-5">
            <ul className="space-y-5">
              {([
                ["Machine Setup", exercise.setup_cue || "Choose a manageable load and check your equipment."],
                ["Starting Position", exercise.position_cue || "Get stable and brace your core before you move."],
                ["Key Movement Cue", exercise.movement_cue || exercise.instructions || "Move slowly and with control."],
              ] as const).map(([label, cue]) => (
                <li key={label} className="flex gap-3 text-sm leading-relaxed">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span><strong className="block font-semibold text-foreground">{label}</strong><span className="text-muted-foreground">{cue}</span></span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {exercise ? <MachineAlignment key={`machine-${exercise.id}`} exerciseId={exercise.id} /> : null}
        {exercise ? (
          <WarmUpCalculator key={`warmup-${exercise.id}`} exerciseId={exercise.id} weight={Number(weight) || 0} />
        ) : (
          <p className="mt-4 text-muted-foreground">{isLoading ? "Loading exercise details…" : "No exercise is assigned to this workout."}</p>
        )}
        {lastLog && (
          <div className="mt-6 rounded-2xl border border-primary/40 bg-card p-5" aria-live="polite">
            <p className="text-sm text-muted-foreground">
              Last time: {lastLog.weight_kg} kg × {lastLog.reps_completed}
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              Today: Try to hit <span className="text-primary">{lastLog.reps_completed + 1} reps</span> or add{" "}
              <span className="text-primary">2.5kg</span>.
            </p>
          </div>
        )}
      </div>

      {/* Set logging inputs */}
      <div className="mt-10 grid grid-cols-1 gap-5 min-[380px]:grid-cols-2 min-[380px]:gap-3" role="group" aria-label="Log a set">
        <Stepper label="Weight (kg)" unit="kg" value={weight} onChange={setWeight} step={2.5} min={0} max={500} inputMode="decimal" />
        <Stepper label="Reps" unit="rep" value={reps} onChange={setReps} step={1} min={0} max={100} inputMode="numeric" />
      </div>
      <PlateVisualizer weight={Number(weight) || 0} />

      {/* Logged sets for this exercise */}
      {sets.some((x) => x.exercise_index === index) && (
        <section aria-label="Logged sets" className="mt-8 divide-y divide-border rounded-lg border border-border bg-card">
          {sets.filter((x) => x.exercise_index === index).map((x) => (
            <div key={x.key} className="px-4 py-3">
              {editingKey === x.key ? (
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-sm font-semibold text-muted-foreground">Set {x.set_number}</span>
                  <input aria-label="Corrected weight in kg" inputMode="decimal" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-primary/50 bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
                  <span className="text-xs text-muted-foreground">kg</span>
                  <input aria-label="Corrected reps" inputMode="numeric" value={editReps} onChange={(e) => setEditReps(e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-primary/50 bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
                  <span className="text-xs text-muted-foreground">reps</span>
                  <Button type="button" size="sm" onClick={saveEdit}>Save</Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-sm font-semibold text-foreground">Set {x.set_number}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{x.weight_kg} kg × {x.reps}</span>
                  {x.status !== "saved" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      <CloudOff className="size-3" aria-hidden="true" /> Saved locally
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => startEdit(x)} aria-label={`Edit set ${x.set_number}`} className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-primary">
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => handleDeleteSet(x.key)} aria-label={`Delete set ${x.set_number}`} className="flex size-9 items-center justify-center rounded-md text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Log Set */}
      <div className="mt-8">
        <Button
          type="button"
          onClick={handleLogSet}
          disabled={logging || finishing || !exercise || restEndsAt !== null}
          className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon"
        >
          {logging
            ? "Logging…"
            : setsDone
              ? isLastExercise
                ? "Finish Workout"
                : "Next Exercise"
              : `Log Set ${setNumber}`}
        </Button>
      </div>

      {/* Secondary swap action */}
      <div className="mt-5 flex justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSwapOpen(true)}
          disabled={swapping || !exercise}
          className="h-auto min-h-11 whitespace-normal rounded-lg px-6 py-3 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRightLeft aria-hidden="true" /> Both Machines Occupied? Swap Exercise
        </Button>
      </div>

      <Drawer open={swapOpen} onOpenChange={setSwapOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[85dvh] rounded-t-lg border-primary/40 bg-background">
          <DrawerHeader className="mx-auto w-full max-w-lg px-6 text-left">
            <DrawerTitle className="text-xl">Choose an Alternative Setup</DrawerTitle>
            <DrawerDescription>Same movement pattern as {exercise?.name ?? "this exercise"}.</DrawerDescription>
          </DrawerHeader>
          <div className="mx-auto w-full max-w-lg space-y-3 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {loadingOptions && <p className="py-4 text-sm text-muted-foreground">Finding alternatives…</p>}
            {!loadingOptions && swapOptions?.length === 0 && <p className="py-4 text-sm text-muted-foreground">No alternatives for this one, Bro. Wait a minute for the machine.</p>}
            {swapOptions?.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSwap(opt)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-4 text-left transition hover:border-primary hover:shadow-neon"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{opt.name}</span>
                  <span className="block text-xs text-muted-foreground">{opt.equipment_type} · {opt.movement_type}</span>
                </span>
                <ArrowRightLeft className="size-4 shrink-0 text-primary" aria-hidden="true" />
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

       <div className="mt-auto pt-10">
        <Link
           to="/home"
          className="flex h-12 w-full items-center justify-center rounded-xl text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
           Back to home
        </Link>
      </div>
       {blocker.status === "blocked" && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 px-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="exit-title">
           <div className="w-full max-w-sm rounded-lg border border-primary/40 bg-card p-6 text-center">
             <p id="exit-title" className="text-xl font-semibold text-foreground">Active Workout in Progress!</p>
             <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Are you sure you want to abandon your workout? Progressive stats for this session will not be saved.</p>
             <Button type="button" onClick={() => blocker.reset?.()} className="mt-6 h-12 w-full font-semibold shadow-neon">Continue Training</Button>
             <Button type="button" variant="outline" onClick={() => { clearActiveSession(); blocker.proceed?.(); }} className="mt-3 h-12 w-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive">Abandon Session</Button>
           </div>
         </div>
       )}
       {restEndsAt !== null && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-7 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Rest timer">
           <div className="w-full max-w-sm text-center">
             <p className="text-sm font-semibold uppercase tracking-widest text-primary">Rest between sets</p>
             <p className="mt-4 text-7xl font-semibold tabular-nums text-foreground" role="timer" aria-label={`${secondsLeft} seconds remaining`}>
               {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
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
                   onClick={() => {
                     setRestEndsAt((end) => (end === null ? end : end - restSecs * 1000 + s * 1000));
                     setRestSecs(s);
                   }}
                   className={`h-10 rounded-full border-2 px-4 text-sm font-semibold transition ${restSecs === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
                 >
                   {s}s
                 </button>
               ))}
             </div>
             <Button type="button" variant="link" onClick={() => setRestEndsAt(null)} className="mt-5 text-base text-muted-foreground hover:text-primary">
               Skip Rest
             </Button>
           </div>
         </div>
       )}
    </div>
  );
}
