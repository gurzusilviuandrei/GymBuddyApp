import { useMemo, useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { barWeight, PLATE_SETS, platesPerSide, roundToPlates } from "@/lib/plates";
import type { WeightUnit } from "@/lib/weight-units";

/** Turn a partially-typed field into a usable number; never NaN, never negative. */
function toNumber(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Keep only digits (plus one decimal point when decimals are allowed). */
function sanitize(raw: string, inputMode: "decimal" | "numeric"): string {
  const cleaned = raw.replace(",", ".").replace(inputMode === "numeric" ? /[^0-9]/g : /[^0-9.]/g, "");
  if (inputMode === "numeric") return cleaned.replace(/^0+(?=\d)/, "").slice(0, 4);
  const [whole = "", ...rest] = cleaned.split(".");
  const head = whole.replace(/^0+(?=\d)/, "").slice(0, 4);
  if (rest.length === 0) return head;
  return `${head || "0"}.${rest.join("").slice(0, 2)}`;
}

export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  inputMode,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  max: number;
  inputMode: "decimal" | "numeric";
  unit: string;
}) {
  const current = toNumber(value);
  const bump = (dir: 1 | -1) => {
    // Round to the step grid so repeated taps can't drift into 7.500000000000001.
    const raw = current + dir * step;
    const snapped = Math.round(raw / step) * step;
    const next = Math.min(max, Math.max(min, Math.round(snapped * 100) / 100));
    onChange(String(next));
  };
  const btn =
    "flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition active:scale-90 active:border-primary active:text-primary disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => bump(-1)} aria-label={`Decrease ${label} by ${step} ${unit}`} disabled={current <= min}>
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode={inputMode}
          pattern={inputMode === "numeric" ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(sanitize(e.target.value, inputMode))}
          placeholder="0"
          className="h-16 w-full min-w-0 rounded-2xl border-2 border-input bg-card px-2 text-center text-xl font-semibold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-hidden focus:ring-3 focus:ring-primary/25"
        />
        <button type="button" className={btn} onClick={() => bump(1)} aria-label={`Increase ${label} by ${step} ${unit}`} disabled={current >= max}>
          <Plus className="size-5" aria-hidden="true" />
        </button>

      </div>
    </div>
  );
}

// How a plate looks, from the heaviest to the lightest in the member's plate set (kg or lb).
const PLATE_LOOKS = [
  { cls: "bg-plate-red text-plate-white", h: "h-20" },
  { cls: "bg-plate-blue text-plate-white", h: "h-20" },
  { cls: "bg-plate-yellow text-plate-ink", h: "h-16" },
  { cls: "bg-plate-green text-plate-white", h: "h-14" },
  { cls: "bg-plate-white text-plate-ink", h: "h-11" },
  { cls: "bg-plate-small text-plate-white", h: "h-9" },
  { cls: "bg-plate-small text-plate-white", h: "h-7" },
] as const;

const look = (set: readonly number[], value: number) => PLATE_LOOKS[Math.max(0, set.indexOf(value))] ?? PLATE_LOOKS[PLATE_LOOKS.length - 1]!;

/** `weight` is in the member's own unit (kg or lb), the same number they typed. */
export function PlateVisualizer({ weight, unit }: { weight: number; unit: WeightUnit }) {
  const [open, setOpen] = useState(false);
  const set = PLATE_SETS[unit];
  const bar = barWeight(unit);
  const { plates, leftover } = useMemo(() => platesPerSide(weight, unit), [weight, unit]);
  const word = unit === "kg" ? "kilogram" : "pound";
  return (
    <section className="mt-5 rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-foreground">
        Plate Math (Barbell)
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {weight < bar ? (
            <p className="text-sm text-muted-foreground">Enter at least {bar} {unit} — that's the empty Olympic bar.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {weight} {unit} = {bar} {unit} bar + <span className="text-foreground">each side:</span>{" "}
                {plates.length ? plates.join(" + ") + ` ${unit}` : "no plates"}
              </p>
              <div className="mt-5 flex items-center overflow-x-auto" role="img" aria-label={`One sleeve loaded with ${plates.map((p) => `${p} ${word}`).join(", ") || "no plates"}`}>
                <div className="h-3 w-10 shrink-0 rounded-l bg-muted-foreground" />
                <div className="h-6 w-2 shrink-0 bg-muted-foreground" />
                {plates.map((p, i) => {
                  const l = look(set.plates, p);
                  return (
                    <div key={i} className={cn("ml-0.5 flex w-7 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold [writing-mode:vertical-rl]", l.cls, l.h)}>
                      {p}
                    </div>
                  );
                })}
                <div className="h-3 w-16 shrink-0 rounded-r bg-muted-foreground/60" />
              </div>
              {leftover > 0 && <p className="mt-3 text-xs text-muted-foreground">{leftover} {unit} can't be matched with standard plates — round to the nearest {set.roundTo} {unit}.</p>}
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {set.plates.slice(0, 5).map((p) => (
                  <span key={p} className="flex items-center gap-1.5">
                    <span className={cn("size-3 rounded-full", look(set.plates, p).cls)} aria-hidden="true" />
                    {p} {unit}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// The lightest way to start warming up, by equipment ("Barbell" | "Dumbbell" | "Machine").
const firstWarmUp = (equipment: string | undefined, unit: WeightUnit): string | undefined =>
  ({ Barbell: `Empty bar (${barWeight(unit)} ${unit})`, Dumbbell: "Light dumbbells", Machine: "Lightest machine setting" } as Record<string, string>)[equipment ?? ""];

/** `weight` is in the member's own unit (kg or lb). */
export function WarmUpCalculator({ weight, exerciseId, equipment, unit }: { weight: number; exerciseId: string; equipment?: string | undefined; unit: WeightUnit }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const steps = useMemo(() => {
    const round = (n: number) => roundToPlates(n, unit);
    return [
      { label: firstWarmUp(equipment, unit) ?? `Empty bar (${barWeight(unit)} ${unit}) or light dumbbells`, reps: 8 },
      { label: weight > 0 ? `${round(weight * 0.5)} ${unit} (50%)` : "50% of working weight", reps: 5 },
      { label: weight > 0 ? `${round(weight * 0.75)} ${unit} (75%)` : "75% of working weight", reps: 3 },
    ];
  }, [weight, equipment, unit]);
  return (
    <section className="mt-5 rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-foreground">
        Warm-Up Calculator (Optional)
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {weight <= 0 && <p className="mb-3 text-xs text-muted-foreground">Enter your working weight below to see exact numbers.</p>}
          <ul className="space-y-3">
            {steps.map((s, i) => {
              const key = `${exerciseId}-${i}`;
              const checked = Boolean(done[key]);
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => setDone((d) => ({ ...d, [key]: !checked }))}
                    className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition", checked ? "border-primary/60 bg-primary/10 text-muted-foreground line-through" : "border-border text-foreground")}
                  >
                    <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground")}>
                      {checked && <Check className="size-4" aria-hidden="true" />}
                    </span>
                    <span>Step {i + 1}: {s.label} × {s.reps} reps</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Warm-ups stay on this device and don't count toward your workout totals.</p>
        </div>
      )}
    </section>
  );
}
