import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import gymBuddyLogo from "@/assets/gymbuddy-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Welcome to GymBuddy" },
      { name: "description", content: "GymBuddy is the beginner's gym guide. Start your training journey with confidence." },
      { property: "og:title", content: "Welcome to GymBuddy" },
      { property: "og:description", content: "The beginner's gym guide. Start your training journey with confidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col overflow-hidden bg-background px-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-foreground">
      {/* Unified group: logo + subtitle + graphic, centered as one block with
          even empty space above and below. 24px (gap-6) between the subtitle
          and the top of the barbell circle. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
        <header className="text-center">
          <img
            src={gymBuddyLogo}
            alt="GymBuddy"
            className="welcome-logo mx-auto h-auto w-48 object-contain"
          />
          <p className="mt-4 text-sm font-medium text-muted-foreground">The beginner&rsquo;s gym guide.</p>
        </header>

        <div className="relative flex aspect-square w-full max-w-72 items-center justify-center" aria-hidden="true">
          <div className="absolute inset-3 rounded-full border border-border/70" />
          <div className="absolute inset-10 rounded-full border border-primary/40" />
          <div className="absolute inset-17 rounded-full bg-card" />
          <div className="absolute left-2 top-1/2 h-px w-12 bg-primary/70" />
          <div className="absolute right-2 top-1/2 h-px w-12 bg-primary/70" />
          <Dumbbell className="relative size-28 -rotate-35 text-primary drop-shadow-[0_0_22px_var(--primary)]" strokeWidth={1.15} />
          <span className="absolute bottom-4 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
          <span className="absolute left-1/2 top-4 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
        </div>
      </div>

      <Button asChild size="lg" className="h-16 w-full justify-center rounded-lg text-center text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]">
        <Link to="/onboarding" className="justify-center">
          Get Started <ArrowRight className="ml-2" aria-hidden="true" />
        </Link>
      </Button>
    </main>
  );
}