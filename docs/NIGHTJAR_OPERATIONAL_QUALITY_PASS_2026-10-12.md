# Nightjar operational quality pass — 12 October 2026

**Project:** `nightjar-audio` · **Branch:** `main` after review/merge · **Launch state:** closed beta. This pass must not automatically open public registration, disable age assurance, or begin charging subscribers.

## 1. Notifications (device reliability and safety)

- **Correct target:** `sendTestPushNotification` now accepts an optional 16-character per-account device identifier. The backend restricts test delivery to that device's own active token; normal notifications still fan out to the account's active devices.
- **Mixed versions:** `myPushNotificationStatus` advertises `targetedTestsSupported: true`. The frontend checks this capability before enabling or invoking a one-device test. Until the updated backend is deployed, the old server might still broadcast a test, so Nightjar **does not allow** the new client to send one.
- **Private content:** test push respects minimal notification wording; it must not display adult-content details on a lock screen by default.
- **Click isolation:** notification route navigation is restricted to same-origin paths. This avoids unexpected external destinations from push notification data.
- **Honest result:** FCM accepting a test is not proof the phone displayed a notification. Users are told to check the device with the app in the background.
- **Manual QA outstanding:** Chrome Android browser and installed PWA, desktop Chrome/Edge, and Safari installed web app on supported iOS. Test permission granted/denied, sign-in/out, stale tokens, offline/online, dormant apps and foreground messages. An iOS browser tab is not interchangeable with an installed iOS web app.

**Deployment order after merge:** Frontend Hosting deploys automatically. To enable the new targeted tests, explicitly deploy exactly `myPushNotificationStatus,sendTestPushNotification` from the manual Firebase backend workflow with `functions:selected` and `DEPLOY-NIGHTJAR`. This is a genuine production backend update and requires human approval. Until both live callables use the new version, the single-device test remains unavailable. The updated shared push-delivery helper does not require redeploying unrelated Functions solely to change their unchanged behaviour. Confirm deployment report, ACTIVE metadata, and test actual device delivery with a consenting tester.

## 2. Creator experience

- The self-service professional multi-role application has an explicit, keyboard-accessible **Continue to application details** button that scrolls the form into view on small screens; selected roles remain selected until submission.
- Existing unified public profiles, approved role tabs and directory discovery are **preserved**. This pass does not silently change role approvals, paid entitlements, ownership, profile privacy or who may view unreleased scripts.
- **Manual QA outstanding:** listener becoming Writer/VA, selecting multiple roles, viewing an approved role from another account, submitting a mobile application without Tab, saving profile fields while changing roles, Android Chrome and iOS Safari/PWA.

## 3. Administrator operations

- Updating an account's active workspace, status or temporary tester access now uses a busy guard, visible error feedback and no overlapping form mutations.
- Pending professional applications show **attention required**, not a green status.
- Human approval, security evidence review, content moderation, separate approved/pending role queues and intentional account suspensions remain intact.
- **Manual QA outstanding:** failure/timeout recovery, account suspension, repeated admin taps, role upgrades requiring legal/age acceptance, content moderation and per-recipient admin email selection.

## 4. Production readiness

- The release dashboard now explicitly marks payment-provider acceptance/consumer billing and legal/privacy/operator sign-off as **public-launch blockers**, independently from whether GitHub and Firebase deployments are green.
- These are **human sign-off gates**, not computer-detectable facts. No background scan can certify adult-content processor acceptance, legal compliance or accurate live age assurance.
- Existing beta age-assurance bypass and closed-beta restrictions remain unchanged. Live Didit signed 18+ verification, under-18 denial, account-binding and consent evidence remain essential before launch.
- Do not activate paid subscriptions without a processor whose terms explicitly permit the Nightjar business model, live checkout and cancellation/refund tests, clear creator payout contracts, customer disclosures and professional UK legal/regulatory review.

## Evidence / limitations

Automated tests inspect device-target routing, constrain push navigation with a simulated Service Worker notification click, assert visible errors/guards, and confirm new launch blockers. GitHub CI and Hosting preview must pass before merging.

This does **not** assert that mobile notifications have been delivered in real-world conditions, that external processors have approved Nightjar, that statutory compliance is complete, or that a public launch is safe. Those require independent evidence and explicit owner approval.
