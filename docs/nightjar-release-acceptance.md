# NightJar — release acceptance matrix

**Status: user confirmed Didit and notifications work (16 October 2026). Other workstreams remain unverified; this is not a blanket sign-off of all 16 items.**

Automated CI validates builds, contracts and emulated Firestore rules/slot contention. It **does not** verify real identity providers, production account permissions, push delivery to actual devices, or the 16 workstreams end-to-end. Do not create new Didit sessions merely to perform this smoke test. Use existing approved test accounts, mock data, and recorded decision receipts.

## Acceptance instructions
There is no separate Firebase staging project and no PR Hosting preview in this release path. CI is deliberately no-deploy. Run desktop, Android APK/PWA and iOS web/PWA acceptance against the live NightJar app only after the owner has explicitly approved the relevant controlled production release. Use the designated approved test accounts and non-sensitive test content; preserve existing Didit approvals and maintain the 18+ gate. Do not start another paid Didit session to complete a checklist. Record the date, test account **role only**, platform and result (PASS/FAIL/BLOCKED) for each workflow; never put personal identities, ID documents or live access tokens in this document.

| # | Workstream | Required hands-on evidence | State |
|---|---|---|---|
| 1 | Sign-in & recovery | Reload session, passkeys/biometrics, password recovery and logout | NOT RUN |
| 2 | Mandatory Didit | Unverified member blocked; already-approved member admitted once; revoke blocks; notice acceptance recorded | USER CONFIRMED WORKING · full matrix evidence not recorded |
| 3 | Legal & consent | Versioned Terms and Didit notice accessible, explicit checks required | NOT RUN |
| 4 | Listener Home | Premium content first; fixed Spotlight; keyboard/touch navigation | NOT RUN |
| 5 | Discovery/search | Correct release, script and member destinations; no broken deep links | NOT RUN |
| 6 | Audio playback | Seek, play/pause, media controls, resume, protected access, transcript where provided | NOT RUN |
| 7 | Public profiles | Header, tagline, follow counts, role-specific tabs and official approved moon only | NOT RUN |
| 8 | VA Creator Studio | Upload draft, save, moderation, scheduling, publish; no role leakage | NOT RUN |
| 9 | Writer Studio | Script upload, licensing, approval and visibility boundaries | NOT RUN |
| 10 | Editor Studio | Portfolio, collaboration offers, media previews and privacy | NOT RUN |
| 11 | Artist Studio | Gallery, licensing, moderation, commissions and profile appearance | NOT RUN |
| 12 | Community & messaging | Follow/unfollow, inbox permissions, reporting and owner handling | NOT RUN |
| 13 | Credited member flows | Member claim, uploader confirm/dispute, invitation accept/decline, rejected appeal and old claim direct links | NOT RUN |
| 14 | Admin credit moderation | Independent reviewer required, approve/reject/revoke/appeal, audit trail, queue pagination | NOT RUN |
| 15 | Notifications | In-app, push, private preview text, claimant/uploader/admin deep link, read/unread behavior | USER CONFIRMED WORKING · full matrix evidence not recorded |
| 16 | Responsive/accessibility | Android/iOS/desktop, 200% font, screenreader focus, reduced motion, tap targets | NOT RUN |

## High-risk evidence to retain privately
- Two simultaneous claims for the same release slot: one wins; the other receives an actionable conflict, no duplicate approval.
- Client SDK cannot directly read/write `verifiedCreditClaims`, `verifiedCreditLocks` or audit events.
- A listener with a verified credit stays a listener; uploader-supplied contributor IDs are never treated as proof.
- Only the claim participant or server-authenticated owner can open `getCreditClaim`; reviewer cannot be claimant or uploader.
- Existing Didit approval is not replaced and no extra paid verification is issued by credit workflows.
- New callables, indexes and rules deploy in exact, audited backend batches as part of an owner-approved controlled release; test the matching live workflow after its required backend dependencies are ready.

## Production release policy — quality-gated, not blanket-frozen

NightJar is expected to progress through the full implementation, merge and deployment process. **Merge and deploy each coherent release once the work has reached a satisfactory engineering standard.** Do not hold completed, independently safe work indefinitely because an unrelated, non-critical manual workstream is still marked NOT RUN. Equally, do not merge or deploy unfinished work, failed checks or changes whose production impact is not understood.

### Merge and deployment acceptance
Before merging a change:
- The intended behavior is implemented and reviewed against the relevant issue/acceptance criteria.
- Focused regression tests and all applicable CI, build, typecheck, security-contract and backend checks pass. Any skipped or unavailable check is explicitly recorded with its reason and risk.
- Authentication, account isolation, data ownership, rights, moderation and privacy boundaries are preserved.
- The release identifies the exact source SHA and exact backend resources/functions/indexes affected; no unnecessary broad deployment.
- A rollback/recovery route and post-deploy verification are identified.
- The release owner has reviewed the evidence and considers the change satisfactory.

Deploy backend dependencies first, in controlled selected-resource batches, then deploy the matching Hosting/frontend release. Verify deployed revisions and the live workflow they support. A green CI run or Hosting build alone is not proof of end-to-end production acceptance. Keep every not-yet-tested user journey explicitly NOT RUN/BLOCKED with a reason and follow-up owner; do not claim it passed.

### Non-negotiable 18+ and launch safeguards
- **Do not weaken, bypass, remove or make optional the mandatory 18+ gate.** The gate remains fail-closed and enforced by authoritative backend evidence, not a client-side flag or UI state.
- Unverified members must remain blocked from age-restricted content and privileged creator/content access. Existing approved evidence must remain account-bound; revocation must continue to block access.
- No test bypass, admin convenience path, alternate sign-in, role switch, stale session or client-supplied claim may grant age approval.
- Preserve existing Didit approvals and avoid unnecessary paid verification sessions.
- Do not enable public signup/charging or declare public launch readiness until the separate legal, privacy, age-verification, rights, moderation, payment-provider and critical security gates are evidenced and owner-approved. Keep CLOSED_BETA and existing production safeguards in force until then.

### Release decision
The release owner may approve merge and controlled deployment when the change meets the criteria above. A critical security, privacy, rights, account-isolation or 18+ failure blocks the affected release. Non-critical incomplete work may be deferred transparently; it does not automatically prohibit merging and deploying unrelated work that is already satisfactory. Preview deployment is not a production launch.
