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

## Production go/no-go
Release owner signs off each workstream, backend deployment run IDs, index readiness and Didit verification behavior. If any critical issue or untested workflow remains, **do not merge or deploy**. Preview deployment is not a production launch.
