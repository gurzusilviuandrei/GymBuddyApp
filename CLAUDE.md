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
- `complete_workout` is idempotent and rotates the A → B → C split only when the day it finishes is the day due.

## Authentication

- Supabase email and password sign-up with email confirmation. Phones store the session in Capacitor Preferences; the web build uses localStorage.
- The publishable key (`sb_publishable_…`) is sent only as the `apikey` header (see `client.ts`).
- Email links (confirm sign-up, reset password, change email) point to `app.gymbuddyapp.gymbuddy://auth-callback/...` on phones (`authRedirectUrl` in `platform.ts`). Supabase Redirect URLs must include `app.gymbuddyapp.gymbuddy://auth-callback/**`.
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

## Known issues (as of 2026-10-06)

No open bugs. Things that look like bugs but aren't:
- `workout_logs.is_personal_record` means "was a record when it was logged". It only triggers the 🏆 popup in the response, and no screen reads it back. Deleting a set leaves other sets' flags unchanged on purpose: record checks always compare against the sets that exist.

Before launch:
   - SMTP email provider (Supabase's built-in email only reaches the project team), sending from the member's own domain
   - The member creates the Play upload key and `android/keystore.properties` (README → Release builds); the build setup is done
   - Privacy policy and account-deletion web pages (required by Play), then the Play Console listing and internal testing
   - Store billing via RevenueCat, including `subscription_period_end` expiry
   - HTTPS App Links instead of the custom URL scheme
   - iOS project and an iOS rest timer
   - Decide whether to drop the Paddle columns

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
