# NightJar spotlight 403 resolution — 14 October 2026

## Verified incident
- GitHub Actions `Nightjar spotlight scheduler` failed in runs [38512880645](https://github.com/Mort2307/NightJar-Audio/actions/runs/38512880645) and [38497669505](https://github.com/Mort2307/NightJar-Audio/actions/runs/38497669505) with `curl: (22) The requested URL returned error: 403`.
- The obsolete GitHub workflow POSTed a GitHub OIDC token to `https://nightjar-42eeag.v2.appdeploy.ai/api/internal/cron/spotlights`. This is not NightJar's current Firebase backend, so changing Firebase Authentication permissions cannot repair that obsolete endpoint.
- Modern `functions/src/index.ts` already contains `notifyDailySpotlights` and `spotlightState`, sharing the same per-member/day idempotent notification logic.

## Safe remediation
1. Delete `.github/workflows/spotlight-scheduler.yml`. Its twice-daily GitHub cron must not continue contacting the retired endpoint.
2. Keep the authenticated `spotlightState` callable as an on-demand Discover fallback.
3. Use the **existing** Firebase `notifyDailySpotlights` export at **09:00 Europe/London** (BST/GMT automatically adjusted). No unprotected public cron URL or GitHub OIDC token forwarding.
4. Release only `functions:notifyDailySpotlights` via NightJar's already-guarded manual `firebase-backend-deploy.yml`, triggered once from a tagged squash merge. Hosting waits for backend success and verifies the exact deployed SHA. No general all-functions redeploy.
5. Contract-test the absence of the legacy job, UK schedule, idempotence and guarded deployment.

## Cost / limits
- No Cloud Tasks queue, no third-party service and no duplicated twice-daily GitHub Action runs.
- The native daily scheduled function uses Cloud Scheduler and normal Firebase invocation/Firestore usage, so it is **not an unconditional £0 promise**. Google Cloud provides three free Cloud Scheduler jobs per **billing account**, with additional jobs charged at USD 0.10 per 31-day month as documented; check other jobs under the same billing account. This source repository also defines a separate scheduled publisher.
- The existing spotlight implementation reads Firestore accounts and listening events. Do not conflate this with a notification queue scaling project; no fan-out overhaul is included.
- An Action passing proves deployed code, **not** that the next 09:00 delivery has already run or reached phones. Real-device and next scheduled-run acceptance remain separately required.
