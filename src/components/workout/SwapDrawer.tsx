import { ArrowRightLeft } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { Exercise } from "@/lib/workout-logic";
import { useBackToClose } from "@/lib/back-stack";

export type SwapOption = Exercise & { equipment_type: string; movement_type: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string | undefined;
  loading: boolean;
  options: SwapOption[] | undefined;
  onPick: (option: SwapOption) => void;
};

/** Bottom sheet of same-movement alternatives when the machine is taken (Pro). */
export function SwapDrawer({ open, onOpenChange, exerciseName, loading, options, onPick }: Props) {
  useBackToClose(open, () => onOpenChange(false));
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[85dvh] rounded-t-lg border-primary/40 bg-background">
        <DrawerHeader className="mx-auto w-full max-w-lg px-6 text-left">
          <DrawerTitle className="text-xl">Choose an Alternative Setup</DrawerTitle>
          <DrawerDescription>Same movement pattern as {exerciseName ?? "this exercise"}.</DrawerDescription>
        </DrawerHeader>
        <div className="mx-auto w-full max-w-lg space-y-3 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {loading && <p className="py-4 text-sm text-muted-foreground">Finding alternatives…</p>}
          {!loading && options?.length === 0 && <p className="py-4 text-sm text-muted-foreground">No alternatives for this one, Bro. Wait a minute for the machine.</p>}
          {options?.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick(opt)}
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
  );
}
