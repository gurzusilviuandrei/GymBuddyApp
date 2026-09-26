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

GymBuddy uses separate TanStack routes for Welcome (/), equipment onboarding (/onboarding), Home (/home), and the workout tracker (/workout) so each step can be revisited directly and navigated with typed links.


Home and Workout share one Day 1 server query that resolves the saved user's equipment, ordered program exercise IDs, exercise rows, and target prescription. Why: prevents dashboard and tracker data from drifting or falling back to mock content.

- /workout takes a `mode` search param ("premade" | "custom" | unset = active default) that getDayOneWorkout accepts to resolve either program on demand; Home's two program cards link with mode so both plans stay launchable side by side. Why: a saved custom routine must not hide the ready-made plan.

- Auth: email/password with confirmation; public.users.id = auth user id. Private pages live under src/routes/_authenticated; all gym server functions use requireSupabaseAuth and scope by context.userId (admin client for writes). Why: data belongs to the signed-in account, not localStorage.

- Home blocks only browser Back navigation while mounted, not reloads or deliberate in-app links; Sign Out uses a replacement navigation to Welcome. Why: signed-in users must not return to onboarding or auth through history, while keeping intentional navigation available.

- Account settings use authenticated server functions for identity-scoped reads, email changes, and deletion; password recovery uses the public reset route and the auth provider's recovery session. Why: sensitive account operations must be validated server-side and recovery links must work while signed out.

- Home, History, and Profile share a fixed bottom tab bar; Onboarding and Workout omit it. Why: avoid mid-session exits.

- Exercise cues live on exercise rows; sessions run all exercises and total their logged-set IDs. Why: guidance and totals stay accurate.

- Custom routine order lives in the signed-in user’s custom_exercise_ids; edit locally until saved. Why: unsaved changes must not alter the active plan.
