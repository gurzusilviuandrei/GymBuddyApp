import { useMemo, useState } from "react";
import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const bump = (dir: 1 | -1) => {
    const current = Number(value) || 0;
    const next = Math.min(max, Math.max(min, Math.round((current + dir * step) * 100) / 100));
    onChange(String(next));
  };
  const btn =
    "flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition active:scale-90 active:border-primary active:text-primary disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={() => bump(-1)} aria-label={`Decrease ${label} by ${step} ${unit}`} disabled={(Number(value) || 0) <= min}>
          <Minus className="size-5" aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode={inputMode}
          pattern={inputMode === "numeric" ? "[0-9]*" : "[0-9]*[.,]?[0-9]*"}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", ".").replace(inputMode === "numeric" ? /[^0-9]/g : /[^0-9.]/g, ""))}
          placeholder="0"
          className="h-16 w-full min-w-0 rounded-2xl border-2 border-input bg-card px-2 text-center text-xl font-semibold tabular-nums text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-hidden focus:ring-3 focus:ring-primary/25"
        />
        <button type="button" className={btn} onClick={() => bump(1)} aria-label={`Increase ${label} by ${step} ${unit}`}>
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const BAR_KG = 20;
const PLATES = [
  { kg: 25, cls: "bg-plate-red text-plate-white", h: "h-20" },
  { kg: 20, cls: "bg-plate-blue text-plate-white", h: "h-20" },
  { kg: 15, cls: "bg-plate-yellow text-plate-ink", h: "h-16" },
  { kg: 10, cls: "bg-plate-green text-plate-white", h: "h-14" },
  { kg: 5, cls: "bg-plate-white text-plate-ink", h: "h-11" },
  { kg: 2.5, cls: "bg-plate-small text-plate-white", h: "h-9" },
  { kg: 1.25, cls: "bg-plate-small text-plate-white", h: "h-7" },
];

export function platesPerSide(total: number) {
  let side = (total - BAR_KG) / 2;
  const out: (typeof PLATES)[number][] = [];
  for (const p of PLATES) {
    while (side >= p.kg - 1e-9) {
      out.push(p);
      side -= p.kg;
    }
  }
  return { plates: out, leftover: Math.round(side * 2 * 100) / 100 };
}

export function PlateVisualizer({ weight }: { weight: number }) {
  const [open, setOpen] = useState(false);
  const { plates, leftover } = useMemo(() => platesPerSide(weight), [weight]);
  return (
    <section className="mt-5 rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-foreground">
        Plate Math (Barbell)
        <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-5 pb-5 pt-4">
          {weight < BAR_KG ? (
            <p className="text-sm text-muted-foreground">Enter at least {BAR_KG} kg — that's the empty Olympic bar.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {weight} kg = {BAR_KG} kg bar + <span className="text-foreground">each side:</span>{" "}
                {plates.length ? plates.map((p) => p.kg).join(" + ") + " kg" : "no plates"}
              </p>
              <div className="mt-5 flex items-center overflow-x-auto" role="img" aria-label={`One sleeve loaded with ${plates.map((p) => `${p.kg} kilogram`).join(", ") || "no plates"}`}>
                <div className="h-3 w-10 shrink-0 rounded-l bg-muted-foreground" />
                <div className="h-6 w-2 shrink-0 bg-muted-foreground" />
                {plates.map((p, i) => (
                  <div key={i} className={cn("ml-0.5 flex w-7 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold [writing-mode:vertical-rl]", p.cls, p.h)}>
                    {p.kg}
                  </div>
                ))}
                <div className="h-3 w-16 shrink-0 rounded-r bg-muted-foreground/60" />
              </div>
              {leftover > 0 && <p className="mt-3 text-xs text-muted-foreground">{leftover} kg can't be matched with standard plates — round to the nearest 2.5 kg.</p>}
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {PLATES.slice(0, 5).map((p) => (
                  <span key={p.kg} className="flex items-center gap-1.5">
                    <span className={cn("size-3 rounded-full", p.cls)} aria-hidden="true" />
                    {p.kg} kg
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

export function WarmUpCalculator({ weight, exerciseId }: { weight: number; exerciseId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const steps = useMemo(() => {
    const round = (n: number) => Math.round(n / 2.5) * 2.5;
    return [
      { label: "Empty bar (20 kg) or light dumbbells", reps: 8 },
      { label: weight > 0 ? `${round(weight * 0.5)} kg (50%)` : "50% of working weight", reps: 5 },
      { label: weight > 0 ? `${round(weight * 0.75)} kg (75%)` : "75% of working weight", reps: 3 },
    ];
  }, [weight]);
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
