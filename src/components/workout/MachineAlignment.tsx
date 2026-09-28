import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getMachineSetting, saveMachineSetting } from "@/lib/gym.functions";
import { cn } from "@/lib/utils";

const OPTIONS = ["", "1", "2", "3", "4", "5", "6", "7", "8", "A", "B", "C", "D", "E", "F"];

export function MachineAlignment({ exerciseId }: { exerciseId: string }) {
  const qc = useQueryClient();
  const fetchSetting = useServerFn(getMachineSetting);
  const save = useServerFn(saveMachineSetting);
  const key = ["machine-setting", exerciseId];
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchSetting({ data: { exercise_id: exerciseId } }) });
  const [open, setOpen] = useState(false);
  const [seat, setSeat] = useState("");
  const [pad, setPad] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSeat(data.seat_notch);
    setPad(data.pad_notch);
    setNote(data.custom_setting_notes);
  }, [data]);

  if (!data?.is_machine) return null;

  const summary = [data.seat_notch && `Seat: Notch ${data.seat_notch}`, data.pad_notch && `Pad: Notch ${data.pad_notch}`].filter(Boolean).join(" • ");

  const onSave = async () => {
    setSaving(true);
    const next = { exercise_id: exerciseId, seat_notch: seat, pad_notch: pad, custom_setting_notes: note.slice(0, 120) };
    try {
      await save({ data: next });
      qc.setQueryData(key, { ...data, seat_notch: seat, pad_notch: pad, custom_setting_notes: next.custom_setting_notes });
      toast.success("Setup saved, Bro. We'll remember it next time.");
      setOpen(false);
    } catch {
      toast.error("Couldn't save your setup. Check your signal and try again.");
    } finally {
      setSaving(false);
    }
  };

  const select = "h-12 w-full rounded-lg border-2 border-input bg-card px-3 text-base font-semibold text-foreground focus:border-primary focus:outline-hidden";

  return (
    <section className="mt-4 rounded-lg border border-primary/50 bg-card shadow-neon/20">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-primary">⚙️ Machine Alignment Notes</span>
          <span className="block truncate text-xs text-muted-foreground">
            {summary || data.custom_setting_notes || "Tap to save your seat and pad settings"}
          </span>
          {summary && data.custom_setting_notes && <span className="block truncate text-xs text-muted-foreground">{data.custom_setting_notes}</span>}
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Seat Notch
              <select value={seat} onChange={(e) => setSeat(e.target.value)} className={select}>
                {OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pad Notch/Setting
              <select value={pad} onChange={(e) => setPad(e.target.value)} className={select}>
                {OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Other Adjustment Note
            <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Leg pad notch 3" className="h-11 rounded-lg border-2 border-input bg-card px-3 text-sm normal-case tracking-normal text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-hidden" />
          </label>
          <button type="button" onClick={onSave} disabled={saving} className="text-sm font-semibold text-primary underline underline-offset-4 disabled:opacity-50">
            {saving ? "Saving…" : "Save Setup"}
          </button>
        </div>
      )}
    </section>
  );
}
