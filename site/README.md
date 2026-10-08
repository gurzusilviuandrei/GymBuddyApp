# GymBuddy website (static)

Plain HTML, CSS and one small script: no build step. Pages:

| File | Address | Purpose |
|---|---|---|
| `index.html` | `/` | Short landing page |
| `privacy.html` | `/privacy` | Privacy policy (Google Play needs a public URL) |
| `delete-account.html` | `/delete-account` | How to delete an account (Google Play needs a public URL) |
| `open.html` + `open.js` | `/open` | Where the links in GymBuddy's emails land: "Done, open GymBuddy" (button on Android, message on a computer) |

## Before publishing

The pages name "Andrei, France" as the operator and `support@gymbuddyapp.app` as the contact (in `privacy.html` and `delete-account.html`). **That mailbox must exist and be read** (Google Play also checks the contact address); change both pages if the address changes.

Then have the policy read by someone who can judge it for your country. It describes what the app does today; keep it in step with the app (CLAUDE.md lists what changes should trigger an update).

## Hosting

Any static host that serves a folder works (Cloudflare Pages, Netlify, GitHub Pages). Point it at this `site/` folder, with clean URLs on (`/privacy` for `privacy.html`), and attach `www.gymbuddyapp.app` to it.

## Making email links land here (not done yet)

Only after the site is live:

1. Supabase → Authentication → URL Configuration → add `https://www.gymbuddyapp.app/open` to the Redirect URLs.
2. In the app, make `authRedirectUrl` (`src/lib/platform.ts`) return that address on phones.

Until both are done, emails keep opening the app directly, as before. Old app versions keep working because the old redirect stays allowed.
