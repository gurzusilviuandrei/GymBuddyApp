<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

GymBuddy uses separate typed routes for Welcome, Onboarding, Home, and Workout. Why: each step remains directly revisit-able.

- Pre-made plan rotates via `users.next_split_day` (A→B→C→A, advanced in completeWorkout); Home and Workout share the authenticated split-day query for equipment, ordered exercises, and targets. Why: both screens stay consistent.
- Workout `mode` selects premade or custom independently. Why: a custom routine must not hide the guided plan.
- Email/password accounts map `users.id` to the auth user; protected functions scope by `context.userId`. Why: account data never trusts browser identity.
- Home blocks only browser Back; Sign Out clears protected caches and replaces history. Why: avoid stale protected screens without blocking deliberate links.
- Account settings and recovery use authenticated server actions and provider recovery sessions. Why: sensitive changes stay server-validated.
- Home, History, and Profile share the bottom tabs; Onboarding and Workout omit them. Why: avoid mid-session exits.
- Exercise cues live on exercise rows; completion totals only this session's log IDs. Why: guidance and totals stay accurate.
- Custom routine order lives in `custom_exercise_ids` and edits stay local until save. Why: drafts must not alter the active plan.
- Sets update optimistically, retry locally, and remain editable before Finish. Why: poor gym connectivity must not corrupt stats.
- Bro Cards render in-browser as 1080×1920 PNGs. Why: personal workout metrics remain on-device.
- Pro access lives on `users.subscription_tier` + `subscription_environment`, written only by the signed payments webhook; Pro server functions call `assertPro` with the client's payment env. Why: the paywall UI is cosmetic and test purchases must not unlock live.
- Capacitor shell (`capacitor.config.ts`) loads the published site via `server.url`; native projects are generated locally with `npx cap add ios|android`. Why: the app is server-rendered, so there is no static bundle to ship.
