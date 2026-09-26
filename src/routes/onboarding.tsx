import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get Started — GymBuddy" },
      { name: "description", content: "Set up your GymBuddy profile and choose the equipment you have available." },
      { property: "og:title", content: "Get Started — GymBuddy" },
      { property: "og:description", content: "Set up your GymBuddy profile and choose the equipment you have available." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

const TOTAL_STEPS = 2;

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

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Step {step} of {TOTAL_STEPS}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-label="Onboarding progress">
        <div
          className="h-full rounded-full bg-primary shadow-neon transition-[width] duration-500 ease-out"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Onboarding() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const ageNumber = Number(age);
  const detailsValid = name.trim().length > 0 && age.trim().length > 0 && Number.isFinite(ageNumber) && ageNumber >= 10 && ageNumber <= 100;

  const goToStep2 = () => {
    if (!detailsValid) return;
    try {
      localStorage.setItem("gymbuddy-profile", JSON.stringify({ name: name.trim(), age: ageNumber }));
    } catch {
      // storage unavailable — continue anyway
    }
    setStep(2);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col overflow-hidden bg-background px-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-10 text-foreground">
      <ProgressBar step={step} />

      <div className="relative mt-12 flex flex-1 flex-col">
        {/* Step 1 — Personal Details */}
        <section
          aria-hidden={step !== 1}
          className={cn(
            "flex flex-1 flex-col transition-[transform,opacity] duration-500 ease-out",
            step === 1 ? "translate-x-0 opacity-100" : "pointer-events-none absolute inset-0 -translate-x-10 opacity-0",
          )}
        >
          <header>
            <h1 className="text-[2.1rem] font-semibold leading-tight">Tell us about yourself, Bro</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              We&rsquo;ll tailor your routine to you. Takes ten seconds.
            </p>
          </header>

          <form
            className="mt-12 flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              goToStep2();
            }}
          >
            <div className="flex flex-col gap-5">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                autoComplete="name"
                maxLength={60}
                aria-label="Full Name"
                className="h-16 rounded-lg border-2 border-border bg-card px-6 text-lg text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0"
              />
              <Input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Your Age"
                inputMode="numeric"
                min={10}
                max={100}
                aria-label="Age"
                className="h-16 rounded-lg border-2 border-border bg-card px-6 text-lg text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-0"
              />
            </div>

            <div className="mt-auto pt-14">
              <Button
                type="submit"
                size="lg"
                disabled={!detailsValid}
                className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
              >
                Next Step
              </Button>
            </div>
          </form>
        </section>

        {/* Step 2 — Equipment */}
        <section
          aria-hidden={step !== 2}
          className={cn(
            "flex flex-1 flex-col transition-[transform,opacity] duration-500 ease-out",
            step === 2 ? "translate-x-0 opacity-100" : "pointer-events-none absolute inset-0 translate-x-10 opacity-0",
          )}
        >
          <header>
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
        </section>
      </div>
    </main>
  );
}
