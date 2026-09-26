import { useState, type FormEvent, type MouseEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, KeyRound, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount, getAccountSettings, updateAccountEmail } from "@/lib/account.functions";

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

function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadSettings = useServerFn(getAccountSettings);
  const saveEmail = useServerFn(updateAccountEmail);
  const removeAccount = useServerFn(deleteAccount);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["account-settings"],
    queryFn: () => loadSettings(),
  });

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
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("A secure reset link has been dispatched to your email.");
    } catch {
      toast.error("Couldn't send the reset link. Try again.");
    } finally {
      setSendingReset(false);
    }
  };

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (deleteText !== "DELETE" || deleting) return;
    setDeleting(true);
    try {
      await queryClient.cancelQueries();
      await removeAccount({ data: { confirmation: "DELETE" } });
      queryClient.clear();
      localStorage.removeItem("gymbuddy-profile");
      await supabase.auth.signOut({ scope: "local" });
      navigate({ to: "/", replace: true });
    } catch {
      setDeleting(false);
      toast.error("Couldn't delete your account. Your data is still safe.");
    }
  };

  return (
    <main className="home-enter mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-background px-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-8 text-foreground">
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

      <section className="mt-auto pt-20">
        <div className="rounded-lg border border-destructive/60 bg-destructive/5 p-5">
          <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Permanently remove your profile, workout history, and login account.</p>
          <AlertDialog onOpenChange={(open) => !open && setDeleteText("")}>
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
              <label className="mt-2 space-y-2 text-sm font-medium">
                <span>Type DELETE to confirm</span>
                <Input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" className="h-12 border-destructive/60 bg-background px-4" />
              </label>
              <AlertDialogFooter className="mt-3 gap-2">
                <AlertDialogCancel disabled={deleting}>Keep Account</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleteText !== "DELETE" || deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deleting ? "Deleting…" : "Permanently Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </main>
  );
}