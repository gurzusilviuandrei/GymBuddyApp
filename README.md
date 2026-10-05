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
3. In the Supabase dashboard → **Authentication → URL Configuration**, add this Redirect URL:
   `app.gymbuddyapp.gymbuddy://auth-callback/**`
4. Copy `.env.example` to `.env` and fill in your project URL and publishable key (Project Settings → API).
5. `npm install`

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in your browser at http://localhost:5173 |
| `npm run typecheck` | Check the code for type errors |
| `npm test` | Run the database, security and exercise-library tests (no internet or Supabase needed) |
| `npm run check` | Everything GitHub checks on every push: types, lint, tests and a full build |
| `npm run app:sync` | Build the app and copy it into the Android project |
| `npm run app:android` | Open the Android project in Android Studio (run it on a phone or emulator from there) |

Run `npm run app:sync` after every code change you want on the phone.

On Windows PowerShell, use `npm.cmd` instead of `npm` (e.g. `npm.cmd test`).

## Automatic checks

Every push to GitHub runs `.github/workflows/ci.yml`: type check, lint, tests, app build and an Android debug build (the APK is downloadable from the run for 14 days). Only merge to `main` when the check is green.

## Pro access

Pro is the `subscription_tier` column on `users` (`basic` or `pro`). Until store billing is added, set it by hand in the Supabase table editor to test Pro features.
