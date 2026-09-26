import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Select Your Equipment" },
      {
        name: "description",
        content:
          "Pick the equipment you train with — full gym machines, dumbbells, or barbell — and generate a personalized routine.",
      },
      { property: "og:title", content: "Select Your Equipment" },
      {
        property: "og:description",
        content:
          "Pick the equipment you train with and generate a personalized routine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const EQUIPMENT_OPTIONS = [
  { id: "full-gym", label: "Full Gym Machines" },
  { id: "dumbbells", label: "Dumbbells Only" },
  { id: "barbell", label: "Barbell Only" },
] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 text-primary-foreground"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Index() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-background px-7 pb-10 pt-16 text-foreground">
      <header>
        <h1 className="text-[2.1rem] font-semibold leading-tight tracking-tight">
          Select Your Equipment
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Tell us what you have access to and we&rsquo;ll build your routine
          around it.
        </p>
      </header>

      <div className="mt-12 flex flex-col gap-5" role="radiogroup" aria-label="Equipment">
        {EQUIPMENT_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(option.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border-2 bg-card px-7 py-8 text-left text-lg font-medium transition-all duration-200",
                isSelected
                  ? "border-primary text-foreground shadow-neon"
                  : "border-border text-foreground/80 hover:border-muted-foreground/60"
              )}
            >
              {option.label}
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}
              >
                {isSelected && <CheckIcon />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-14">
        <button
          type="button"
          disabled={!selected}
          className="h-16 w-full rounded-2xl bg-primary text-lg font-semibold tracking-wide text-primary-foreground shadow-neon transition hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
        >
          Generate My Routine
        </button>
      </div>
    </div>
  );
}
