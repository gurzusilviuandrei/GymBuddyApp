import { useState, type FormEvent, type MouseEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileDown, KeyRound, Mail, Search, ShieldCheck, Trash2, UserRound, Zap, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl } from "@/lib/platform";
import { saveFile } from "@/lib/native-files";
import { deleteAccount, exportMyData, getAccountSettings, updateAccountEmail } from "@/lib/account-api";
import { usePro } from "@/components/pro/ProProvider";
import { durableStorage } from "@/lib/durable-storage";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile & Settings — GymBuddy" },
      { name: "description", content: "Manage your GymBuddy profile, email, password, and account security." },
      { property: "og:title", content: "Profile & Settings — GymBuddy" },
      { property: "og:description", content: "Manage your GymBuddy profile, email, password, and account security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

const GYM_LINGO = [
  ["PR", "Personal Record. The heaviest weight or most reps you have ever successfully lifted."],
  ["RPE", "Rate of Perceived Exertion. A scale from 1-10 measuring how hard a set felt."],
  ["Superset", "Performing two different exercises back-to-back with zero rest in between."],
  ["AMRAP", "As Many Reps As Possible. Lifting until your muscles completely fatigue."],
  ["Deload", "A planned week of lighter weights to let your joints and nervous system recover."],
  ["Spotter", "A gym buddy who stands nearby to safely catch the weight if you fail a rep."],
  ["Rep", "One complete movement of an exercise, from the start position and back again."],
  ["Set", "A group of reps performed together before you take a rest."],
  ["Failure", "The point where you cannot complete another clean rep with good form."],
  ["Form", "The way you position and move your body while performing an exercise safely."],
  ["Compound Exercise", "A movement that trains several joints and muscle groups at the same time."],
  ["Isolation Exercise", "A movement designed to focus mainly on one muscle group."],
  ["DOMS", "Delayed Onset Muscle Soreness. The stiffness that can appear one or two days after training."],
  ["Progressive Overload", "Gradually asking your body to do more by adding weight, reps, or better control."],
  ["Tempo", "The speed you use for each part of a rep, including lifting, pausing, and lowering."],
] as const;

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isPro, loaded, openPaywall } = usePro();
  const loadSettings = getAccountSettings;
  const saveEmail = updateAccountEmail;
  const removeAccount = deleteAccount;
  const exportData = exportMyData;
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [verifyStep, setVerifyStep] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [lingoSearch, setLingoSearch] = useState("");

  const { data: account, isLoading } = useQuery({
    queryKey: ["account-settings"],
    queryFn: () => loadSettings(),
  });
  const normalizedSearch = lingoSearch.trim().toLowerCase();
  const filteredLingo = GYM_LINGO.filter(([term, definition]) => `${term} ${definition}`.toLowerCase().includes(normalizedSearch));

  const beginEmailEdit = () => {
    setNewEmail(account?.email ?? "");
    setEditingEmail(true);
  };

  const handleEmailUpdate = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setSavingEmail(true);
    try {
      await saveEmail({ data: { email: parsed.data } });
      setEditingEmail(false);
      toast.success("Check both inboxes to confirm your new email address.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't update your email.");
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!account?.email || sendingReset) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(account.email, {
        redirectTo: authRedirectUrl("/reset-password"),
      });
      if (error) throw error;
      toast.success("A secure reset link has been dispatched to your email.");
    } catch {
      toast.error("Couldn't send the reset link. Try again.");
    } finally {
      setSendingReset(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const payload = await exportData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      await saveFile(blob, `gymbuddy-training-history-${new Date().toISOString().slice(0, 10)}.json`, "My GymBuddy training history");
      toast.success("Your training history has been downloaded.");
    } catch {
      toast.error("Couldn't export your data. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (deleteText !== "DELETE" || deleting) return;
    if (!verifyStep) {
      setVerifyStep(true);
      return;
    }
    if (!deletePassword) return;
    setDeleting(true);
    try {
      const result = await removeAccount({ data: { confirmation: "DELETE", password: deletePassword } });
      if (!result.deleted) {
        setDeleting(false);
        setDeletePassword("");
        toast.error("Incorrect password. Your account was not deleted.");
        return;
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      durableStorage.removeItem("gymbuddy-profile");
      await supabase.auth.signOut({ scope: "local" });
      navigate({ to: "/", replace: true });
    } catch {
      setDeleting(false);
      setDeletePassword("");
      toast.error("Couldn't delete your account. Your data is still safe.");
    }
  };

  return (
    <>
    <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-32 pt-8 text-foreground">
      <header className="flex items-center gap-4">
        <Button asChild variant="outline" size="icon" className="size-11 rounded-lg border-border bg-card text-muted-foreground hover:text-foreground">
          <Link to="/home" aria-label="Back to Home"><ArrowLeft aria-hidden="true" /></Link>
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Your account</p>
          <h1 className="mt-1 text-xl font-semibold">Profile & Settings</h1>
        </div>
      </header>

      <section className="mt-12 flex items-center gap-5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
          <UserRound className="size-8" strokeWidth={1.6} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold">{isLoading ? "Loading…" : account?.fullName}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{account?.email}</p>
          <Badge className="mt-3 border border-primary/40 bg-primary/10 text-primary hover:bg-primary/10">Bro Status: {account?.tier === "pro" ? "Pro" : "Free"}</Badge>
        </div>
      </section>

      {loaded && !isPro && (
        <section className="mt-8">
          <button
            type="button"
            onClick={openPaywall}
            className="group w-full rounded-lg border-2 border-primary/40 bg-card p-5 text-left shadow-neon transition-transform active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Zap className="size-6" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">Upgrade to Pro</h2>
                <p className="mt-1 text-sm text-muted-foreground">Custom routines, multi-swap & advanced analytics — €9.99/mo.</p>
              </div>
              <span className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">See Pro</span>
            </div>
          </button>
        </section>
      )}

      {loaded && isPro && (
        <section className="mt-8 rounded-lg border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CreditCard className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground">Your Pro subscription</h2>
              <p className="mt-1 text-sm text-muted-foreground">Custom routines, multi-swap and advanced analytics are unlocked.</p>
            </div>
          </div>
        </section>
      )}

      <section className="mt-14">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Account Security</h2>
        </div>

        <div className="mt-5 divide-y divide-border rounded-lg border border-border bg-card px-5">
          <div className="py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Mail className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Email address</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{account?.email}</p>
                </div>
              </div>
              {!editingEmail && <Button variant="outline" size="sm" onClick={beginEmailEdit}>Update Email</Button>}
            </div>
            {editingEmail && (
              <form onSubmit={handleEmailUpdate} className="mt-5 space-y-3">
                <Input type="email" autoComplete="email" aria-label="New email address" placeholder="Enter new email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="h-12 border-border bg-background px-4" />
                <div className="flex gap-3">
                  <Button type="submit" disabled={savingEmail} className="flex-1">{savingEmail ? "Saving…" : "Save Email"}</Button>
                  <Button type="button" variant="outline" onClick={() => setEditingEmail(false)}>Cancel</Button>
                </div>
              </form>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="mt-1 text-sm text-muted-foreground">Send a secure reset link</p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={sendingReset || !account?.email} onClick={handlePasswordReset}>
              {sendingReset ? "Sending…" : "Reset Password"}
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Gym Lingo Decoder</h2>
        </div>
        <div className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={lingoSearch} onChange={(event) => setLingoSearch(event.target.value)} type="search" aria-label="Search gym terms" placeholder="Search a term or meaning" className="h-12 bg-background pl-11 pr-4" />
          </div>
          <div className="mt-4 divide-y divide-border" aria-live="polite">
            {filteredLingo.map(([term, definition]) => (
              <div key={term} className="py-4 first:pt-1 last:pb-0">
                <h3 className="font-semibold text-primary">{term}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{definition}</p>
              </div>
            ))}
            {filteredLingo.length === 0 && <p className="py-5 text-sm text-muted-foreground">No gym term matches that search.</p>}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-3">
          <FileDown className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Data Privacy & Compliance</h2>
        </div>
        <div className="mt-5 rounded-lg border border-border bg-card p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">Download a copy of your profile, every logged set, and all completed workouts.</p>
          <Button variant="outline" className="mt-4 w-full border-primary/50 text-primary hover:bg-primary/10 hover:text-primary" disabled={exporting} onClick={handleExport}>
            <FileDown aria-hidden="true" /> {exporting ? "Preparing…" : "Export Training History (CSV/JSON)"}
          </Button>
        </div>
      </section>

      <section className="mt-auto pt-20">
        <div className="rounded-lg border border-destructive/60 bg-destructive/5 p-5">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Permanently remove your profile, workout history, and login account.</p>
          <AlertDialog onOpenChange={(open) => { if (!open) { setDeleteText(""); setVerifyStep(false); setDeletePassword(""); } }}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="mt-5 w-full border-destructive/70 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 aria-hidden="true" /> Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="mx-5 w-[calc(100%-2.5rem)] max-w-md rounded-lg border-destructive/60 bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your Bro profile?</AlertDialogTitle>
                <AlertDialogDescription className="leading-relaxed">
                  Are you absolutely sure you want to permanently delete your Bro profile and all workout history?
                </AlertDialogDescription>
              </AlertDialogHeader>
              {!verifyStep ? (
                <label className="mt-2 space-y-2 text-sm font-medium">
                  <span>Type DELETE to confirm</span>
                  <Input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" className="h-12 border-destructive/60 bg-background px-4" />
                </label>
              ) : (
                <label className="mt-2 space-y-2 text-sm font-medium">
                  <span className="flex items-center gap-2"><KeyRound className="size-4 text-destructive" aria-hidden="true" />Verify your password to confirm identity</span>
                  <Input type="password" autoFocus value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} aria-label="Verify your password to confirm identity" autoComplete="current-password" className="h-12 border-destructive/60 bg-background px-4" />
                </label>
              )}
              <AlertDialogFooter className="mt-3 gap-2">
                <AlertDialogCancel disabled={deleting}>Keep Account</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleteText !== "DELETE" || deleting || (verifyStep && !deletePassword)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Verifying…" : verifyStep ? "Verify & Delete" : "Continue"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </main>
    <BottomNav />
    </>
  );
}