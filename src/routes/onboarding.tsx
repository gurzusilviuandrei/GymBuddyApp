import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Select Your Equipment — GymBuddy" },
      { name: "description", content: "Choose the equipment you have available before starting with GymBuddy." },
      { property: "og:title", content: "Select Your Equipment — GymBuddy" },
      { property: "og:description", content: "Choose the equipment you have available before starting with GymBuddy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

const EQUIPMENT_OPTIONS = [
  { id: "full-gym", label: "Full Gym Machines" },
  { id: "dumbbells", label: "Dumbbells Only" },
  { id: "barbell", label: "Barbell Only" },
] as const;

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 text-primary-foreground" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Onboarding() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-14 text-foreground">
      <header>
        <p className="mb-6 text-xs font-semibold uppercase text-primary">GymBuddy / 01</p>
        <h1 className="text-[2.1rem] font-semibold leading-tight">Select Your Equipment</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Tell us what you have access to and we&rsquo;ll build your routine around it.
        </p>
      </header>

      <div className="mt-12 flex flex-col gap-5" role="radiogroup" aria-label="Equipment">
        {EQUIPMENT_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(option.id)}
              className={cn(
                "flex h-auto min-h-22 w-full items-center justify-between whitespace-normal rounded-lg border-2 bg-card px-7 py-6 text-left text-lg font-medium text-foreground transition-[border-color,box-shadow] duration-200 hover:bg-card hover:text-foreground",
                isSelected ? "border-primary shadow-neon" : "border-border hover:border-muted-foreground/60",
              )}
            >
              {option.label}
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200", isSelected ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                {isSelected && <CheckIcon />}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="mt-auto pt-14">
        <Button asChild size="lg" className={cn("h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]", !selected && "pointer-events-none opacity-40 shadow-none")}>
          <Link to="/home" aria-disabled={!selected} tabIndex={selected ? undefined : -1}>Generate My Routine</Link>
        </Button>
      </div>
    </main>
  );
}