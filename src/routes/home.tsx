import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Dumbbell, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Home — GymBuddy" },
      { name: "description", content: "Your GymBuddy home. Get ready for your next guided workout." },
      { property: "og:title", content: "Home — GymBuddy" },
      { property: "og:description", content: "Your GymBuddy home. Get ready for your next guided workout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-12 text-foreground">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-foreground" aria-label="GymBuddy welcome">GymBuddy<span className="text-primary">.</span></Link>
        <Button asChild variant="outline" size="icon" className="size-11 rounded-lg border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground" title="Change equipment">
          <Link to="/onboarding" aria-label="Change equipment"><SlidersHorizontal aria-hidden="true" /></Link>
        </Button>
      </header>

      <div className="mt-16">
        <p className="text-xs font-semibold uppercase text-primary">Your training starts here</p>
        <h1 className="mt-5 text-[2.5rem] font-semibold leading-tight">Ready to move?</h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">Take it one set at a time. Your guided workout is ready when you are.</p>
      </div>

      <section className="mt-14" aria-labelledby="workout-heading">
        <div className="mb-5 flex items-end justify-between">
          <h2 id="workout-heading" className="text-lg font-semibold">Your workout</h2>
          <span className="text-xs text-muted-foreground">01 / 01</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase text-primary">Exercise 01</p>
              <h3 className="mt-4 text-2xl font-semibold">Lat Pulldown</h3>
              <p className="mt-2 text-sm text-muted-foreground">3 sets <span className="mx-2 text-primary">·</span> 10 reps</p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Dumbbell size={22} strokeWidth={1.7} aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-auto pt-12">
        <Button asChild size="lg" className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]">
          <Link to="/workout">Start Workout <ArrowRight className="ml-2" aria-hidden="true" /></Link>
        </Button>
      </div>
    </main>
  );
}