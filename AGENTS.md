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

GymBuddy has no sign-in yet: the users and workout_logs tables have RLS with no client policies and are written only through validated server functions (src/lib/gym.functions.ts) using the admin client; the created user id is kept in localStorage "gymbuddy-profile".userId. Why: keeps personal data unreadable from the browser until real accounts exist.
