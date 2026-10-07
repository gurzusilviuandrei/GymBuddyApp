# GymBuddy

A session companion for people who have a gym membership and still freeze in the doorway. Open the app, do the work on the screen, and leave knowing the next visit is already decided.

**Who it's for:** people who are new or returning to the gym and feel lost on the floor.
**The job:** remove uncertainty from going to the gym — guidance, confidence, and a clear next step.

## How it's built

- **App:** React + TanStack Router + Tailwind, built with Vite into `dist/`.
- **Phone:** Capacitor wraps `dist/` into a native Android app (`android/`). iOS comes later from the same code.
- **Backend:** your own Supabase project — Postgres, Auth and the database functions in `supabase/migrations/`. No other server.

## First-time setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database (from this folder):
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
   **If you paste the migrations into the Supabase SQL Editor instead** (the live project was built this way), run each file in `supabase/migrations/` in order, then run `supabase/record-applied-migrations.sql` once. It records them all as applied, so a later `supabase db push` does not try to run them again. After pasting any new migration, run `npm run migrations:record` and paste the regenerated file (it is safe to run repeatedly). A test fails if the file is out of date.
3. In the Supabase dashboard → **Authentication → URL Configuration**, add this Redirect URL:
   `app.gymbuddyapp.gymbuddy://auth-callback/**`, and set the Site URL to `https://www.gymbuddyapp.app` (the bare `gymbuddyapp.app` has no DNS record and does not load).
   Then set up email: under **Authentication → Emails → SMTP Settings**, use MailerSend (`smtp.mailersend.net`, port 587, sender `no-reply@gymbuddyapp.app`). Paste the templates from `supabase/templates/` into **Email Templates**, and raise **Rate Limits → emails per hour**.
4. Copy `.env.example` to `.env` and fill in your project URL and publishable key (Project Settings → API).
5. `npm install`

## Settings that live only in the Supabase dashboard

Migrations cover the database. These are set in the dashboard and are not in any file, so they are written down here (check them if a project is ever rebuilt):

| Where | Setting |
|---|---|
| Authentication → URL Configuration | Site URL `https://www.gymbuddyapp.app`; Redirect URL `app.gymbuddyapp.gymbuddy://auth-callback/**` |
| Authentication → Sign In / Providers → Email | Email + password on, **Confirm email on** |
| Authentication → Emails → SMTP Settings | Custom SMTP: MailerSend (`smtp.mailersend.net`, port 587), sender `no-reply@gymbuddyapp.app`. The SMTP username and password exist only here and at MailerSend; never put them in the repo |
| Authentication → Emails → Templates | The three templates in `supabase/templates/` (confirm sign-up, reset password, change email), pasted by hand |
| Authentication → Rate Limits | Emails per hour raised from the default (the auth server still allows about one email per account per minute) |
| Authentication → Password | Minimum length is the dashboard value; the app asks for 8 or more |
| MailerSend (domain `gymbuddyapp.app`) | Domain verified (SPF, DKIM, return-path); **click and open tracking off** for auth emails, because tracked links add a redirect to every email |
| Database → Publications | `supabase_realtime` includes `public.users` (done by a migration; listed here because Pro status updates depend on it) |

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in your browser at http://localhost:5173 |
| `npm run typecheck` | Check the code for type errors |
| `npm test` | Run the database, security and exercise-library tests (no internet or Supabase needed) |
| `npm run migrations:record` | Rewrite `supabase/record-applied-migrations.sql` after adding a migration |
| `npm run check` | Everything GitHub checks on every push: types, lint, tests and a full build |
| `npm run app:sync` | Build the app and copy it into the Android project |
| `npm run app:android` | Open the Android project in Android Studio (run it on a phone or emulator from there) |

Run `npm run app:sync` after every code change you want on the phone.

On Windows PowerShell, use `npm.cmd` instead of `npm` (e.g. `npm.cmd test`).

## Release builds (Google Play)

Release builds are code-shrunk and signed with your **upload key**. Create the key
once, keep it out of git, and back it up somewhere safe (a password manager or
an encrypted drive). If you lose it you can ask Google to reset it, but that takes days.

1. Create the key (run inside `android/`; pick your own passwords when asked):
   ```
   keytool -genkeypair -v -keystore gymbuddy-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Create `android/keystore.properties` (gitignored) next to it:
   ```
   storeFile=gymbuddy-upload.jks
   storePassword=YOUR-STORE-PASSWORD
   keyAlias=upload
   keyPassword=YOUR-KEY-PASSWORD
   ```
3. Bump `"version"` in `package.json` (each Play upload needs a higher version), then:
   ```
   npm run app:sync
   cd android
   gradlew bundleRelease
   ```
   Upload `android/app/build/outputs/bundle/release/app-release.aab` in Play Console.

Without `keystore.properties`, `gradlew assembleRelease` still builds a release APK
signed with the debug key, for testing the shrunk build on a phone; Play rejects it.

## Automatic checks

Every push to GitHub runs `.github/workflows/ci.yml`: type check, lint, tests, app build and an Android debug build (the APK is downloadable from the run for 14 days). Only merge to `main` when the check is green.

## Pro access

Pro is the `subscription_tier` column on `users` (`basic` or `pro`). Until store billing is added, set it by hand in the Supabase table editor to test Pro features.
