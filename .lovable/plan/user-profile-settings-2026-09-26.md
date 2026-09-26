# User Profile & Settings

## What will be built
- Add a Profile icon beside Sign Out on the Home header, opening a dedicated signed-in Profile screen with a smooth transition.
- Show the member’s saved full name, verified account email, and a `Bro Status: Free` badge. Keep the tier ready to display Pro once payments are enabled later; no payment setup is included now.
- Add Account Security controls for changing email and requesting a password reset link, with clear success and error messages.
- Add a red Danger Zone with a confirmation dialog. Confirming removes the member profile, workout history, and login account, then returns to Welcome.
- Add the public password recovery screen required by the emailed reset link.

## Security and behavior
- Read and change account information only for the signed-in member.
- Validate email changes in both the screen and protected server action.
- Require the user to type `DELETE` in the final deletion dialog to reduce accidental account loss.
- Account deletion runs as one authorized server action: delete workout history, delete the profile, then delete the login identity. Existing database cascade rules provide an additional safeguard.
- Password reset uses the existing secure authentication email flow and never exposes credentials.

## Visual details
- Preserve GymBuddy’s charcoal background, white type, neon-green accent, compact corners, and mobile-first spacing.
- Use the existing red destructive styling only in the Danger Zone.
- Add page-specific title and sharing metadata for Profile and password recovery.

## Verification
- Check the app build and current error logs.
- Test signed-in navigation Home → Profile → Home.
- Test the inline email editor and reset confirmation without exposing account details in logs.
- Verify the deletion confirmation cannot proceed until the safeguard text is entered; avoid deleting a real test account during automated verification.
