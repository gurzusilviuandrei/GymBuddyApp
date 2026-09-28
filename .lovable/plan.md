# Beginner Logistics & Social Sharing

## What will be built
- Add a collapsible Gym Bag Checklist to Home when the signed-in member has zero workout logs. Persist checked items on that device and remove the card automatically after their first completed workout is recorded.
- Add a searchable Gym Lingo Decoder section to Profile with the 15 supplied terms and beginner-friendly definitions.
- Expand the completed-workout screen with the requested neon-bordered recovery and hydration target.
- Add a Share My Bro Card action that creates a polished 1080×1920 PNG containing the white GB monogram, current date, workout duration, total lifted volume, and current weekly consistency count.
- Use the phone’s native share sheet when supported, with a Save to Device Photos download fallback.

## Technical details
- Extend the existing authenticated stats response with an all-time workout-log count so the checklist visibility comes from the signed-in account.
- Keep checklist state in browser storage only; it is comfort/setup state rather than training data.
- Reuse the existing completion response and weekly stats query for card figures. Calculate elapsed time from the saved workout start time.
- Render the social image with the browser Canvas API, avoiding a new runtime dependency and keeping account data on-device.
- Preserve the current charcoal, neon-green, semantic-token styling and existing workout logging flow.

## Verification
- Verify the checklist is interactive, collapsible, persistent after reload, and hidden for accounts with workout logs.
- Verify all 15 glossary terms filter by term and definition.
- Complete a workout and verify recovery advice, duration, volume, weekly count, image generation, share fallback, and PNG download.
- Check desktop and phone layouts, runtime errors, and the final app build.