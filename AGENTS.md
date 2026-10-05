GymBuddy is a standalone mobile app: a Vite + React single-page app bundled into a Capacitor shell (Android now, iOS later) that talks directly to the project's own Supabase. There is no app server and no Lovable dependency.

GymBuddy uses separate typed routes for Welcome, Onboarding, Home, and Workout. Why: each step remains directly revisit-able.

- Data API lives in `src/lib/gym-api.ts` and `src/lib/account-api.ts`; every call takes `{ data }`. Reads query tables directly under RLS; writes call SECURITY DEFINER functions in `supabase/migrations/*_standalone_api.sql` that act as `auth.uid()`. Why: tables only grant members SELECT, so all writes stay server-validated without an app server.
- Never add a function argument that names a user or decides Pro access; the database derives both. Why: the client is untrusted.
- Pre-made plan rotates via `users.next_split_day` (A→B→C→A, advanced in `complete_workout`); Home and Workout share the split-day query for equipment, ordered exercises, and targets. Why: both screens stay consistent.
- Workout `mode` selects premade or custom independently. Why: a custom routine must not hide the guided plan.
- Home blocks only browser Back; Android Back on Welcome/Auth/Home minimizes the app (`NativeBridge`). Sign Out clears protected caches and replaces history. Why: avoid stale protected screens without trapping the member.
- Auth emails redirect to `app.gymbuddyapp.gymbuddy://auth-callback/...` on phones (`authRedirectUrl`); `NativeBridge` turns the link into a session. The URL must be in Supabase Auth → Redirect URLs. Why: links must reopen the app, not a browser.
- Login sessions are stored with Capacitor Preferences on phones. Why: the OS may clear WebView storage.
- Home, History, and Profile share the bottom tabs; Onboarding and Workout omit them. Why: avoid mid-session exits.
- Exercise cues live on exercise rows; completion totals only this session's log IDs. Why: guidance and totals stay accurate.
- Custom routine order lives in `custom_exercise_ids` and edits stay local until save. Why: drafts must not alter the active plan.
- Sets update optimistically, retry locally (`client_key` makes retries idempotent), and remain editable before Finish. Why: poor gym connectivity must not corrupt stats.
- Bro Cards render on-device as 1080×1920 PNGs; saving/sharing goes through `src/lib/native-files.ts`. Why: personal workout metrics remain on-device, and WebViews can't download blobs.
- Pro access is `users.subscription_tier = 'pro'`, checked by `is_pro_user()` inside Pro database functions. Members cannot write that column; only future store-billing code (service role) may. Why: the paywall UI is cosmetic.
- Database changes go in a new file under `supabase/migrations/`; never edit an applied migration.
