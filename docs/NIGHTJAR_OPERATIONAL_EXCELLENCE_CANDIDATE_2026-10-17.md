# NightJar operational excellence — release candidate (17 October 2026)

**Owner direction:** build every priority, do not merge to `main`, deploy Hosting, deploy Cloud Functions, run new paid identity sessions, enable subscriptions or open public registration without separate, explicit owner release approval.

**Candidate branch:** `feature/nightjar-operational-excellence-20261017`. CI on this branch is deliberately BUILD/TEST ONLY. It includes no Firebase deploy, no PR-preview Hosting publish and no billing provider calls.

## Product workstreams — implemented in candidate source
1. **Unified account/identity UX:** obsolete “Age assurance temporarily disabled” is replaced by correct mandatory live Didit messaging. Production backend flags `DIDIT_VERIFICATION_PAUSED = false` and `TESTING_AGE_ASSURANCE_BYPASS = false` are **unchanged**. Protected account/server gates and previously completed Didit verifications must remain intact.
2. **Credited-release acceptance:** an authenticated admin Quality Centre now stores 19 separate check statuses with evidence, reviewer identity and an append-only audit event. The six real-account credit workflows remain NOT VERIFIED until performed using genuinely distinct authorised users. The existing validated claim/appeal backend remains unchanged.
3. **Efficient deployment scope:** `src/App.tsx` and UI-only credit form changes no longer trigger a full credit backend+index redeploy; Firestore indexes deploy only when changed or explicitly tagged. New Quality Centre callables have their own backend-first batch, not a broad `functions` deploy. Existing backup, protected resource and backend-first principles remain.
4. **Launch payment/legal safeguards:** existing admin release-readiness and legal surfaces remain blocked where a legal or payment provider acceptance is not proved. Real Didit status is correctly described. This source change does not turn on checkout, guarantee any provider compatibility or certify UK legal compliance.
5. **Professional onboarding:** explicit four-stage journey, clear pending and declined roles, honest next steps, cloud-saved drafts retained. Role approval still requires real administrator authorisation.
6. **Tester feedback:** private verified-account form in You; Firestore bounded to five submissions/account/day, no image/identity uploads, closed-beta + age/account gating, admin-only queue, status transitions, and private audit events. User-submitted content remains private and requires moderation; no public user feedback leak.
7. **Listening / timed transcript:** reusable zero-AI human transcript workshop. A creator can stamp local reference audio positions onto a transcript draft; the existing player already parses `[mm:ss]` cues, supports playback-following, accessible text size/contrast and cue seeking. Editors/admins can prepare and copy timed transcripts locally without uploading audio or changing protected original releases. Releasing the final transcript still requires the normal draft moderation and access controls.
8. **CEO Operations / Quality Centre:** real existing counts for pending applications, pending artwork and open alerts; unmeasured activation, retention and per-user operating costs are explicitly labelled `Not measured`. The evidence register and feedback triage are available only to verified administrators.

## Three first-build priorities — covered
- Quality & Release Centre = check evidence, queues, private tester feedback.
- Creator/contributor onboarding = existing credit invite/claim workflow plus professional application guidance; no automatic professional role from credits. The six genuine credit journeys still require separate real-user acceptance.
- Premium listening = manual timed transcript production linked to the already-timed, accessible playback reader; no AI, uploads or SaaS charges.

## Launch blockers outside code
- **Legal/regulator:** qualified UK legal/privacy/consumer-rights review, operator identity, adult-content age-assurance evidence, moderation procedures.
- **Payments:** actual adult-content-accepting payment provider's written approval and bank/payout compliance, then tested paid subscription/renewal/refund/failed-payment entitlement flows. Payment switch remains OFF.
- **Real credit QA:** role A uploader, role B contributor, role C independent admin, verified 18+, consented genuine release; exercise claim, invitation, confirmation, independent approval, rejection, appeal, revocation and Credited Listener public visibility. No fake production credits.
- **Devices:** real Android APK and browser/PWA, iOS installed PWA, desktop; accessibility, 200% text, real push, cross-device draft recovery, workspaces and transcript playback.
- **FinOps:** 7/30-day retention, user activation and cost-per-active-user cannot honestly be computed until a privacy-reviewed analytics measurement design, sufficient opted-in traffic and live expense records exist. No fictional metrics.
- **Operations:** no new paid APIs or queues. Firestore writes and Cloud Functions are usage-metered; budgets and guardrails need monitoring as users grow.

## Manual QA for the candidate
- Account portal must truthfully require live Didit while reusing prior approved status.
- You → tester feedback: 20–2500 characters; category, private reference, repeat rate ceiling, denied underage/unapproved/suspended.
- Admin → Overview → Quality & Release Centre: actual queue counts; read quality flags; save reviewer evidence and status; reopen and verify persistence; triage feedback with meaningful reason.
- Admin → Launch: legal/payment barriers visible; no public checkout approval merely from a quality-check marker.
- Professional roles: pending roles cannot use pro tools; rejected application explanation; another already approved role remains available after role changes.
- VA creator release draft: add timed transcript with workshop, apply to draft, review required. Player highlights and can seek timestamped cues for an authorised published release.
- Editor and Admin → Content: copy local timecoded transcript; confirm audio file never leaves local browser or gets automatically published.
- Deploy rules: a UI-only `src/App.tsx` merge would skip credit backend/index, but the candidate's new Quality callables must deploy backend-first when the owner later authorises release.

## Release acceptance rules
1. Source build/contracts and Firebase Auth/Firestore emulators PASS on the **final candidate commit**.
2. No unintended role elevation, test age bypass, provider spending, disclosure of private draft/work or unrestricted external redirects.
3. Owner checks PR visual preview *only if explicitly authorised*; this candidate intentionally has no PR preview.
4. Only after owner gives another direct “merge/deploy” instruction should a production PR/merge/backend+Hosting rollout be attempted; report its actual result rather than claiming live early.

**Do not mark manual real-user checks PASS from a route or a simulation.**
