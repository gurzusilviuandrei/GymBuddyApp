import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createUserProfile } from "@/lib/gym-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { durableStorage } from "@/lib/durable-storage";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const TOTAL_STEPS = 4;

const EQUIPMENT_OPTIONS = [
  { id: "full-gym", label: "Full Gym Machines" },
  { id: "dumbbells", label: "Dumbbells Only" },
  { id: "barbell", label: "Barbell Only" },
] as const;

const FREQUENCY_OPTIONS = [
  { id: "2-days", label: "2 Days / Week" },
  { id: "3-days", label: "3 Days / Week" },
  { id: "4-plus", label: "4+ Days / Week" },
] as const;

const GOAL_OPTIONS = [
  { id: "lose-weight", label: "Lose Weight", subtext: "Burn fat and improve stamina" },
  { id: "gain-muscle", label: "Gain Muscle", subtext: "Build strength and solid mass" },
  { id: "sports-performance", label: "Sports Performance", subtext: "Improve speed and athletic agility" },
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
  const [frequency, setFrequency] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createUser = createUserProfile;

  const ageNumber = Number(age);
  const detailsValid = name.trim().length > 0 && age.trim().length > 0 && Number.isFinite(ageNumber) && ageNumber >= 10 && ageNumber <= 100;

  const saveProfile = (patch: Record<string, unknown>) => {
    try {
      const existing = JSON.parse(durableStorage.getItem("gymbuddy-profile") ?? "{}");
      durableStorage.setItem("gymbuddy-profile", JSON.stringify({ ...existing, ...patch }));
    } catch {
      // storage unavailable — continue anyway
    }
  };

  const goToStep2 = () => {
    if (!detailsValid) return;
    saveProfile({ name: name.trim(), age: ageNumber });
    setStep(2);
  };

  const goToStep3 = () => {
    if (!frequency) return;
    saveProfile({ frequency });
    setStep(3);
  };

  const goToStep4 = () => {
    if (!goal) return;
    saveProfile({ goal });
    setStep(4);
  };

  const buildProfile = async () => {
    if (!selected || !frequency || !goal || saving) return;
    setSaving(true);
    saveProfile({ equipment: selected });
    try {
      const { id } = await createUser({
        data: {
          full_name: name.trim(),
          age: ageNumber,
          frequency: frequency as "2-days",
          primary_goal: goal as "gain-muscle",
          equipment_type: selected as "full-gym",
        },
      });
      saveProfile({ userId: id });
      // Drop anything cached from before onboarding (e.g. "not onboarded yet",
      // or no plan), so Home loads the new profile instead of sending them back.
      await queryClient.invalidateQueries();
      navigate({ to: "/home" });
    } catch {
      toast.error("Couldn't save your profile. Please try again.");
      setSaving(false);
    }
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

        {/* Step 2 — Frequency */}
        <section
          aria-hidden={step !== 2}
          className={cn(
            "flex flex-1 flex-col transition-[transform,opacity] duration-500 ease-out",
            step === 2 ? "translate-x-0 opacity-100" : step < 2 ? "pointer-events-none absolute inset-0 -translate-x-10 opacity-0" : "pointer-events-none absolute inset-0 translate-x-10 opacity-0",
          )}
        >
          <header>
            <h1 className="text-[2.1rem] font-semibold leading-tight">What&rsquo;s your weekly commitment?</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Don&rsquo;t overdo it&mdash;consistency is key.
            </p>
          </header>

          <div className="mt-12 flex flex-col gap-5" role="radiogroup" aria-label="Weekly frequency">
            {FREQUENCY_OPTIONS.map((option) => {
              const isSelected = frequency === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="outline"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setFrequency(option.id)}
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
            <Button
              type="button"
              size="lg"
              disabled={!frequency}
              onClick={goToStep3}
              className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Next Step
            </Button>
          </div>
        </section>

        {/* Step 3 — Goal Selection */}
        <section
          aria-hidden={step !== 3}
          className={cn(
            "flex flex-1 flex-col transition-[transform,opacity] duration-500 ease-out",
            step === 3 ? "translate-x-0 opacity-100" : step < 3 ? "pointer-events-none absolute inset-0 -translate-x-10 opacity-0" : "pointer-events-none absolute inset-0 translate-x-10 opacity-0",
          )}
        >
          <header>
            <h1 className="text-[2.1rem] font-semibold leading-tight">What&rsquo;s your primary goal?</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              We&rsquo;ll shape your routine around what matters most to you.
            </p>
          </header>

          <div className="mt-12 flex flex-col gap-5" role="radiogroup" aria-label="Primary goal">
            {GOAL_OPTIONS.map((option) => {
              const isSelected = goal === option.id;
              return (
                <Button
                  key={option.id}
                  type="button"
                  variant="outline"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setGoal(option.id)}
                  className={cn(
                    "flex h-auto min-h-22 w-full items-center justify-between whitespace-normal rounded-lg border-2 bg-card px-7 py-6 text-left text-lg font-medium text-foreground transition-[border-color,box-shadow] duration-200 hover:bg-card hover:text-foreground",
                    isSelected ? "border-primary shadow-neon" : "border-border hover:border-muted-foreground/60",
                  )}
                >
                  <span className="flex flex-col gap-1">
                    <span>{option.label}</span>
                    <span className="text-sm font-normal text-muted-foreground">{option.subtext}</span>
                  </span>
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200", isSelected ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                    {isSelected && <CheckIcon />}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="mt-auto pt-14">
            <Button
              type="button"
              size="lg"
              disabled={!goal}
              onClick={goToStep4}
              className="h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Next Step
            </Button>
          </div>
        </section>

        {/* Step 4 — Equipment */}
        <section
          aria-hidden={step !== 4}
          className={cn(
            "flex flex-1 flex-col transition-[transform,opacity] duration-500 ease-out",
            step === 4 ? "translate-x-0 opacity-100" : "pointer-events-none absolute inset-0 -translate-x-10 opacity-0",
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
            <Button type="button" size="lg" disabled={!selected || saving} onClick={buildProfile} className={cn("h-16 w-full rounded-lg text-lg font-semibold shadow-neon transition-transform active:scale-[0.98]", !selected && "opacity-40 shadow-none")}>
              {saving ? "Building…" : "Build My Profile"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
