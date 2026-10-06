# GymBuddy: project context for Claude Code

The rules for changing code are in AGENTS.md (imported below); this file is the big picture.
Check the code before trusting anything here: if this file and the code disagree, the code wins.
Tell the user, and update this file in the same change.

@AGENTS.md

## What the app does

GymBuddy is a beginner's gym guide for Android (iOS later). Members sign up, answer
onboarding (name, age, training days per week, goal, equipment), and get a guided
3-day split (A → B → C) with machine setup cues, form demos, a rest timer and simple
set-by-set logging. It works with no signal: sets are saved on the phone and upload later.
It also has workout history with an activity heatmap, personal records, and Bro Cards
(1080×1920 shareable PNGs made on the phone).

Pro features (custom routine editor, exercise swaps, strength graphs) are gated by a
server-side flag. Payments are not built yet: the paywall says "Pro is coming soon".

## Tech stack

- **UI:** React 19 + TypeScript, built with Vite 8 into a single-page app.
- **Routing:** TanStack Router, file-based (`src/routes`, the plugin generates `src/routeTree.gen.ts`, which you don't edit).
- **Data:** TanStack Query, its cache saved on the device for offline use.
- **Styling:** Tailwind CSS 4 and a few shadcn/Radix components in `src/components/ui`. Sonner for toasts, lucide icons, recharts (loaded only when a graph is opened).
- **Phone shell:** Capacitor 8 (Android project in `android/`, no `ios/` yet). Plugins: App, Preferences, Haptics, Share, Filesystem, Keep-Awake, Sentry, plus our own native `RestTimer` (Java).
- **Backend:** Supabase (Postgres, Auth, Realtime), the member's own project `uoljwupvesnnsjipnzyn`. There is no app server.
- **Crash reporting:** Sentry (`@sentry/capacitor` 4.4.0 and `@sentry/react` 10.69.0 are pinned exactly, because the first requires the second at that exact version).
- **Tests:** Vitest. Database tests run every migration in an in-process Postgres (PGlite) as the real `anon`/`authenticated` roles.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`), Node 24 and ubuntu-24.04: types, lint, tests, build, plus an Android debug APK.

## Architecture

```
Phone (Capacitor WebView, bundled dist/)  ──HTTPS──▶  Supabase
  React app                                            ├─ Auth (email + password)
  ├─ reads: tables directly (RLS: own rows only)        ├─ Postgres: tables + RLS
  ├─ writes: supabase.rpc → SECURITY DEFINER functions   │    + plpgsql functions (all writes)
  ├─ durable storage (Capacitor Preferences)             └─ Realtime (users row → Pro status)
  └─ native: RestTimerService, haptics, keep-awake
```

- `src/main.tsx` starts things in this order: Sentry, load durable storage into memory, the device-owner check on auth events, restore the query cache, then render.
- `src/lib/gym-api.ts` and `account-api.ts` hold every data call. Each takes `{ data }`, a leftover shape from the old server functions.
- `src/lib/set-sync.ts` holds the pure, tested upload and retry rules. `set-sync-client.ts` wires them to the server. Both the workout screen and `OfflineSyncWorker` use them.
- `src/lib/durable-storage.ts` is synchronous, backed by native Preferences, and loaded before the first render.
- `src/lib/device-owner.ts` stamps the phone's account data with its account id and erases it when a different account signs in.
- `src/components/NativeBridge.tsx` turns auth email deep links into a session and handles Android Back.
- `SessionGuard` signs the phone out when the session was revoked (checked at start-up and when the app returns to the foreground).
- `ProProvider` holds Pro status (cached per account, kept when offline), the paywall, and Realtime updates.

## Important decisions

- **No Lovable dependency, no server:** the app ships its own bundle (`webDir: dist`, no `server.url`) and talks only to Supabase. The member chose this on 2026-10-05.
- **Fresh start:** no data was migrated from Lovable Cloud. The exercise library and programs were re-seeded from the member's export.
- **All writes go through database functions** that use `auth.uid()`; tables grant members SELECT only. The client is untrusted.
- **Offline-first workout:** sets are optimistic, `client_key` makes retries idempotent, and finishing requires every set to have a server id.
- **Native rest timer** is a short foreground service, not scheduled notifications: exact alarms are denied by default on Android 14+, so scheduled alerts arrive about a minute late.
- **Android backups are off** (`allowBackup="false"`), so the login session can't be restored onto another phone.
- **Release builds are shrunk** (R8 + resource shrinking) and signed with the upload key from the gitignored `android/keystore.properties`; without it they fall back to the debug key (installable locally, rejected by Play). After changing native code or plugins, test a release build (`gradlew assembleRelease`): shrinking can strip classes that are only found by name.
- **Loaders fail instead of returning "empty"** on errors, so the copy saved on the phone stays on screen offline and a blank form can't be saved over real data.
- **One version number:** `package.json` "version". Android derives `versionName` and `versionCode` from it (1.2.3 → 10203), and Sentry uses it as the release.
- **Lint checks code rules only.** Formatting is Prettier (`npm run format`); about 50 older files aren't formatted yet, on purpose, to avoid a huge diff.

## Database structure (public schema)

| Table | Purpose / key columns |
| --- | --- |
| `users` | One row per auth user (`id` = `auth.users.id`, FK with cascade delete). Columns: `full_name`, `age`, `weekly_goal_days`, `primary_goal`, `equipment_type` (NULL means not onboarded), `next_split_day` (A/B/C), `is_custom`, `custom_exercise_ids[]` (ordered), `subscription_tier` ('basic' or 'pro'), `subscription_status`, `subscription_period_end`. Unused Paddle leftovers: `paddle_customer_id`, `paddle_subscription_id`, `subscription_environment`. Members can't write any of it directly. |
| `exercises` | The library (34 rows): `id` (slug), `name`, cues (`setup_cue`, `position_cue`, `movement_cue`), `instructions`, `movement_type`, `equipment_type`, `target`, `alternative_exercise_id`. Readable when signed in. |
| `workout_programs` | 9 rows: equipment type × day 1–3, with `exercise_ids_list[]`, `target_sets` and `target_reps`. |
| `workout_logs` | One row per set: `user_id`, `exercise_id`, `weight_kg`, `reps_completed`, `set_number`, `client_key` (unique per user), `is_personal_record`, `auto_regulated`, `session_id` (NULL until the workout is finished). |
| `workout_sessions` | Finished workouts: totals, `exercise_names[]`, `started_at`/`completed_at`, `program_type`, `auto_regulated`. |
| `user_machine_settings` | Seat and pad notches and notes, per member and exercise. |

The write functions are all in `supabase/migrations/20261005120000_standalone_api.sql` (plus later migrations):
- `ensure_user_row`, `create_user_profile`, `save_custom_routine`
- `log_workout_set`, `update_workout_set`, `delete_workout_set`
- `save_machine_setting`, `complete_workout`, `delete_workout_session`
- `get_alternative_options`, `get_exercise_progress`, `delete_account`
- Helpers `require_user` and `is_pro_user`

Two of them have extra rules:
- `delete_workout_set` only deletes sets that don't belong to a finished workout yet (`session_id IS NULL`).
- `complete_workout` is idempotent and rotates the A → B → C split only when the day it finishes is the day due. With `p_end_at_last_set := true` (only for a forgotten workout, sent only then) it ends at the latest stored set instead of now, never at a time sent by the phone.

## Authentication

- Supabase email and password sign-up with email confirmation. Phones store the session in Capacitor Preferences; the web build uses localStorage.
- The publishable key (`sb_publishable_…`) is sent only as the `apikey` header (see `client.ts`).
- Email links (confirm sign-up, reset password, change email) point to `app.gymbuddyapp.gymbuddy://auth-callback/...` on phones (`authRedirectUrl` in `platform.ts`). Supabase Redirect URLs must include `app.gymbuddyapp.gymbuddy://auth-callback/**`. Without it, Supabase silently falls back to the Site URL (now `https://gymbuddyapp.app`).
- Auth emails go out through MailerSend SMTP from `no-reply@gymbuddyapp.app`; the domain is verified there with SPF, DKIM and return-path records. The domain was bought through Lovable, and its DNS is managed in Lovable's domain settings (Name.com nameservers). The branded templates live in `supabase/templates/` and are pasted into Supabase → Email Templates; re-paste after editing them.
- The auth server allows about one email per account per minute; `emailSendError` (`src/lib/auth-errors.ts`) turns that refusal into a "wait N seconds" message.
- The `/_authenticated` layout route redirects to `/auth` when there's no session, and runs `claimDeviceData`.
- Deleting an account re-checks the password inside the database (`delete_account`).
- The login lockout after failed attempts lives on the device only; Supabase's own rate limits are the real protection.

## Navigation

| Route | Screen |
| --- | --- |
| `/` | Welcome. Signed-in members are sent to `/home` or `/onboarding`. |
| `/auth` | Sign up, log in, forgot password |
| `/reset-password` | Set a new password from the email link |
| `/onboarding` | 4 steps; saves through `create_user_profile` |
| `/home` | Plan cards, weekly ring, resume or abandon an unfinished workout, gym bag checklist |
| `/workout?mode=premade\|custom&sore=fresh\|little\|super` | The tracker (no bottom tabs; leaving mid-workout asks first) |
| `/custom-routine` | Pro routine editor |
| `/history` | Past workouts, heatmap, per-session detail |
| `/profile` | Account, email, password reset, data export, delete account |

Bottom tabs: Home, History, Profile. Android Back minimizes the app on `/`, `/auth`, `/home` and `/onboarding`. On a screen with no history it goes to `/`; otherwise it goes back.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Web dev server (localhost:5173) |
| `npm run check` | Types, lint, tests and build: run before every push |
| `npm test` | Vitest (unit + database tests) |
| `npm run app:sync` | Build and copy into the Android project |
| `npm run app:android` | Open Android Studio |
| `cd android && ./gradlew assembleDebug` | Debug APK |

- **Windows:** in PowerShell use `npm.cmd` and `npx.cmd`. The emulator needs `-dns-server 8.8.8.8,1.1.1.1`.
- `.env` (gitignored) needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and optionally `VITE_SENTRY_DSN` (see `.env.example`); the build fails without the first two.
- **Applying migrations:** `supabase link` returns 403 for this account, so new migration files are pasted into the Supabase SQL Editor by the member. Always give them the SQL to paste.
- **Git workflow:** work on a branch, push, wait for the green CI check, then fast-forward `main`.

## Branches

- `main` is what ships; it only moves by fast-forward from a branch whose latest CI run is green.
- `v1/polish` (long-lived): bug fixes and small improvements.
- `v1/features` (long-lived): bigger features, so they stay separate from polish.
- Don't push a branch until the member says so: every push starts a CI run.

## Known issues (as of 2026-10-06)

### Open bugs (found in review, not fixed yet; member said to note them first)

1. **Assisted Pull-Up progresses the wrong way.** The weight entered is the machine's assistance, so more is easier, but the step-up card says "step up +2.5 kg". For that exercise it should suggest less assistance. (`progression` in `workout-logic.ts`; the exercise is `assisted-pullup`.)
2. **"Machine Setup" label on non-machine exercises.** `buildCues` always labels the first cue "Machine Setup", even for barbell and dumbbell exercises; it should be "Setup" unless the exercise is a machine.
3. **"Syncing N sets…" forever** when the server keeps refusing a set. Rare since new sets are limited to the database's range, but the badge should say a set couldn't be saved and let the member edit it.
4. **The strength graph hides load errors.** `ExerciseProgressChart` ignores `isError`, so a failed load reads "No sets logged in the last 8 weeks".
5. **Swap suggestions ignore the member's equipment** (`get_alternative_options` only matches `movement_type`), so a "Dumbbells only" member can be offered machines or barbells.
6. Cosmetic: a stray duplicate doc comment above `MAX_SET_WEIGHT_KG` in `workout-logic.ts`.
7. **Row cap of 1000 hides data for active members.** Supabase returns at most 1000 rows per query by default. `getActivityDays` (heatmap, asks for 5000 sets over 20 weeks, no ordering) and `exportMyData` (all sets) are cut off after roughly 33 workouts, so the heatmap silently drops days and the "every logged set" export is incomplete. Fix: derive heatmap days from `workout_sessions` (or a database function returning distinct days) and page the export with `.range()`.
8. **Onboarding accepts a decimal age** (`type="number"`, only `Number.isFinite` is checked). The database column is an integer, so the save fails with the generic "Couldn't save your profile". Require a whole number.
9. ~~Login dead ends~~ **Fixed (audit H3):** login refused for "Email not confirmed" now shows a "Resend confirmation email" button (one-minute cooldown shared with the sign-up screen; the server's own wait time is shown if it refuses); offline errors read "No connection. Check your signal and try again." and don't count as wrong passwords; signing up an existing email says so and switches to login (detects both the explicit error and the empty-identities look-alike user). Logic and tests in `src/lib/auth-errors.ts`; screens checked in the browser against faked server replies. Not yet verified against the real Supabase, because that needs an unconfirmed test account.
10. **Misleading Profile text:** the upgrade card says "€9.99/mo" though billing doesn't exist, and the export button says "(CSV/JSON)" but exports JSON only.
11. **Onboarding has no Back button** between its 4 steps, and Android Back minimizes the app there, so a wrong answer can't be corrected without finishing and re-doing it (see the edit-profile feature).
12. **Profile is too wide with large fonts on small phones** (tested on the emulator): the "Update Email" / "Reset Password" rows don't wrap, so the page becomes wider than the screen and the bottom bar gets pushed off. It happens at 1.6× font on a 360dp phone, from 1.3× on a 320dp phone, and at 2.0× even on 411dp. Fix: let those rows wrap or stack (flex-wrap, `min-w-0`). Home also overflows slightly at 2.0× on 360dp (the "WORKOUTS" label touches the ring). History, routine editor and workout screens are fine at every size tested.
13. ~~A workout left open for hours still resumes~~ **Fixed (audit H1):** a saved workout whose last set is more than 12 hours old (`isStaleWorkout`, `STALE_WORKOUT_MS`) is never resumed. Home opens "You have an unfinished workout from [date]" with **Finish it** / **Discard it** / Decide later, shows an "Unfinished workout" card, and asks again if you tap Start; `/workout` redirects Home for a stale session. Finish it → `/workout?finish=stale` → `finishWorkout(true)` → `complete_workout(..., p_end_at_last_set := true)`, so the workout is dated at its last set (the server derives the end time from the stored sets, not from the phone), and Active time / the Bro Card date use that last set. Discard it = `abandonActiveSession` (queues deletion of its saved sets). A stale session with no sets is cleared silently. `ActiveSession.last_set_at` records the last set. **Needs `supabase/migrations/20261006150000_finish_at_last_set.sql` applied** (pasted in the SQL Editor) before "Finish it" can save; normal finishes work without it. The migration is applied on the live database. Tested: database tests, 12-hour cutoff, discard, Back, plus on the emulator against the real database (dialog, Back, Start guard, direct URL, discard, the safe failure path, and Finish it: saved with the right totals, `completed_at` equal to the last set, Bro Card dated that day with Active time 42 min instead of ~1,800).
14. **Set numbers drift after deleting a middle set** (read from the code, not reproduced): `removeSet` renumbers sets on the phone only, so the server keeps the old numbers; the next set can repeat one, and History's detail view shows "Set 1, Set 3, Set 3". Fix: number sets by position when displaying (`getSessionDetail`).
15. **Finishing again with extra sets leaves them orphaned** (confirmed): `complete_workout` returns the already-finished workout and ignores sets added after it. Needs a crash between the server saving and the phone clearing its copy, then logging more; rare.
16. **"Barbell only" plans contain dumbbell exercises** (confirmed in the seed): days 2 and 3 include Dumbbell Pullover, Dumbbell Bulgarian Split Squat and Incline Dumbbell Press. A content decision: swap them for barbell exercises, or rename the option.
17. **The swap drawer is blank offline** (read from the code): a failed load shows neither results nor a message.
19. **A malformed sign-in link fails silently** (confirmed on the emulator): `supabase.auth.setSession` *throws* ("Invalid UTF-8 sequence") for a corrupted token instead of returning an error, and `NativeBridge` doesn't catch it, so there is no message at all. A link cut off by an email app would hit this. Wrap the call in try/catch and show "That link is invalid or has expired." The session is untouched either way.
20. ~~Android Back doesn't dismiss the "abandon workout?" dialog~~ **Fixed:** open dialogs register with `src/lib/back-stack.ts` (`useBackToClose`), and `NativeBridge` runs the top one before navigating. Used by the unfinished-workout dialog and the abandon dialog. The Home check-in and "switch workout" dialogs are plain overlays and don't use it yet.
21. **A workout can't be paused to look at other screens:** "Back to home" and the tab bar only offer "Abandon Session"; the only way to leave a workout and keep it is to close the app. Consider a third option, "Leave it for now".
22. **Editing a set with a decimal comma fails** (from the code; `Number("22,5")` is NaN): the weight box in the "edit set" row passes the raw text to `parseCorrection`, unlike the main weight box, which converts "," to ".". Members in comma-decimal locales (Romania, most of Europe) can't save a corrected 22,5. Normalise the comma in `parseCorrection` / the edit inputs.
23. **Production crash traces will be unreadable:** the bundle is minified and no source maps (JS) or R8 mapping file (Java) are uploaded to Sentry, so reports show scrambled names. Needs `build.sourcemap` plus an upload step in CI using a Sentry auth token kept as a CI secret (the member must add it; never ask for the token in chat).
24. Low: the exported data file and the Bro Card PNG stay in the app's cache folder after sharing (`native-files.ts` writes to `Directory.Cache` and never deletes). App-private, but the export holds all personal data.
25. Low hardening: `file_paths.xml` declares `<external-path path=".">` (Capacitor's default), which is broader than the app needs; only `cache-path` is used for sharing.
26. Maintenance rule: the saved data cache is versioned with `buster: "1"` in `main.tsx`. Bump it whenever the shape of cached query data changes, or old phones keep showing the old shape.
18. Hardening: `authenticated` still has `GRANT UPDATE` on `users`. RLS (no UPDATE policy) blocks it, confirmed by a probe, but revoking the grant would be defense in depth, since every write goes through functions.

### Improvements (go on `v1/polish`)

- Undo on "Set removed" (deleting a set is one tap today).
- Remember the member's rest length between workouts (it resets to 90 s).
- Equipment-aware weight steps: the +/− buttons and the step-up are always 2.5 kg; dumbbells usually go up in 2 kg pairs, machines in 5 kg.
- Home shows Rest & Recovery on every visit once the weekly target is met, so training again needs "Train anyway" each time the screen opens.
- History lists only the latest 100 workouts, with no paging.

### Features (go on `v1/features`)

- **Edit training profile** after onboarding (name, equipment, days per week, goal). Today a member who starts on "Dumbbells only" is stuck on that plan. The `users` columns already exist; it needs a database function and a Profile section. Top priority.
- Pounds (lbs) as well as kg, only if the audience needs it.

### Verified working on the emulator (2026-10-06)

Offline logging, closing and reopening the app offline, and the background sync after reconnecting (queue empty in ~6 s, server has the sets, workout resumes with no "Saved locally" tags); finishing a workout whose sets the background worker uploaded (totals and links correct); Abandon from Home and from the workout; the "workout in progress" dialog; Android Back on every screen; expired-link and bad-code email links; landscape (Home and the rest overlay); the Pro routine editor (add, reorder, remove, save, then restored exactly) and the strength graph with real data (25 kg × 8 → 31.7 kg est. 1RM); sign-out when the server can't be reached (the library still removes the local session); all 34 exercises have demo images; `npm audit` for shipped packages: 0 vulnerabilities; the release (shrunk) build; start-up 3–5 s; all main screens at fonts up to 2.0× except Profile (bug 12).

### Things that look like bugs but aren't
- `workout_logs.is_personal_record` means "was a record when it was logged". It only triggers the 🏆 popup in the response, and no screen reads it back. Deleting a set leaves other sets' flags unchanged on purpose: record checks always compare against the sets that exist.

## Later: launch steps (parked by the member on 2026-10-06; don't start until asked)

The current focus is features, bugs and performance. These wait.

1. **Website decision (ask first):** is the old Lovable website still live at `www.gymbuddyapp.app`?
   - If yes and the member keeps it, they add the two pages in Lovable, with text Claude writes.
   - Otherwise, build a small free-hosted GymBuddy site on the domain: home, privacy policy, account deletion.
2. **Privacy policy and account-deletion pages**, which Google Play requires as public URLs.
3. **Play upload key:** the member creates it plus `android/keystore.properties` (README → Release builds). The build setup is done.
4. **Play Console:** developer account ($25 one-time), store listing, internal testing (closed beta).
5. **Domain ownership:** check how `gymbuddyapp.app` renews if Lovable is cancelled, and consider transferring it to the member's own registrar account. Losing it breaks the app's emails.
6. **Store billing** via RevenueCat, including `subscription_period_end` expiry.
7. **HTTPS App Links** on `gymbuddyapp.app` instead of the custom URL scheme.
8. **iOS:** project and iOS rest timer.
9. **Paddle columns:** decide whether to drop them.

## Things Claude must not change without asking

- **Secrets:** never ask for, store or use the Supabase service_role/secret key, the database password or Sentry auth tokens. The publishable key and the DSN are public and fine.
- **Applied migrations:** never edit a migration that has already been applied. Add a new one, plus tests in `supabase/tests/`.
- **Database destructive changes** (DROP COLUMN or TABLE, deleting data): ask first.
- **Security model:** no table write grants or policies for members; no client-supplied user ids or Pro flags.
- **Sentry privacy:** never add emails, names or workout data to reports.
- **Rest timer:** don't switch it to scheduled or local notifications.
- **App identity:** `appId` `app.gymbuddyapp.gymbuddy`, the URL scheme, and the bundled-app setup (no `server.url`).
- **Exact Sentry versions:** don't loosen the pins.
- **Git history:** don't rewrite pushed history. Don't push straight to `main` without a green check.

## Migration status

- **Done (2026-10-05/06):** left Lovable completely.
  - TanStack Start server functions were replaced by Supabase database functions; the web wrapper by the bundled Capacitor app.
  - Own Supabase project, with all migrations applied through the SQL Editor up to `20261006120000_protect_finished_sets.sql`.
  - Durable offline storage, native rest timer, Sentry, accessibility pass, CI.
  - Audit fixes: per-account phone data, offline Pro, abandon cleanup, email-change links, a single sync code path.
- The `supabase/migrations/202609*` files come from the Lovable era and are already applied; keep them.
- **Not migrated, by design:** old Lovable Cloud data (fresh start) and the website (the app is the only client).
- **Old folder:** `C:\Users\Andrei\Downloads\GymBuddyApp` is the old Lovable download, not a git repo. Its AGENTS.md describes the old architecture. Work only in `GymBuddyApp-git` (GitHub `gurzusilviuandrei/GymBuddyApp`).
