import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Download, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createBroCardBlob, downloadBroCard, type BroCardStats } from "@/lib/bro-card";
import { shareFile } from "@/lib/native-files";

export type WorkoutSummary = {
  sets: number;
  volume: number;
  durationMinutes: number;
  weeklyWorkouts: number;
  /** When the workout ended (ms). Differs from today for a forgotten workout finished later. */
  finishedAt?: number;
};

/** Finished-workout screen: totals, recovery advice and the shareable Bro Card. */
export function WorkoutComplete({ summary, exerciseCount }: { summary: WorkoutSummary | null; exerciseCount: number }) {
  const [broCardUrl, setBroCardUrl] = useState<string | null>(null);
  const [broCardBlob, setBroCardBlob] = useState<Blob | null>(null);
  const [creatingCard, setCreatingCard] = useState(false);

  useEffect(() => () => {
    if (broCardUrl) URL.revokeObjectURL(broCardUrl);
  }, [broCardUrl]);

  const makeCard = async () => {
    if (!summary || creatingCard) return null;
    setCreatingCard(true);
    try {
      const stats: BroCardStats = {
        date: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).format(new Date(summary.finishedAt ?? Date.now())),
        durationMinutes: summary.durationMinutes,
        volumeKg: summary.volume,
        weeklyWorkouts: summary.weeklyWorkouts,
      };
      const blob = await createBroCardBlob(stats);
      if (broCardUrl) URL.revokeObjectURL(broCardUrl);
      setBroCardBlob(blob);
      setBroCardUrl(URL.createObjectURL(blob));
      return blob;
    } catch {
      toast.error("Couldn't create your Bro Card. Try again.");
      return null;
    } finally {
      setCreatingCard(false);
    }
  };

  const handleShareCard = async () => {
    const blob = broCardBlob ?? (await makeCard());
    if (!blob) return;
    await shareFile(blob, "gymbuddy-bro-card.png", "My GymBuddy Bro Card").catch(() => {});
  };

  const handleDownloadCard = async () => {
    const blob = broCardBlob ?? (await makeCard());
    if (blob) await downloadBroCard(blob).catch(() => {});
  };

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-7 py-14 text-center text-foreground home-enter">
      <div className="text-7xl" aria-hidden="true">🏆</div>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Workout Complete!</h1>
      <p className="mt-3 text-lg text-primary">Bro Status Upgraded 🏆</p>
      <p className="mt-4 text-base text-muted-foreground">
        {summary
          ? `${exerciseCount} exercises · ${summary.sets} sets crushed · ${summary.volume} kg lifted. Saved to your History.`
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
