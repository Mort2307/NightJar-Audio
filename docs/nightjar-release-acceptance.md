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


## 12 November 2026 — release evidence reconciliation

### Completed source/release work
- **Release policy:** PR #354 merged to `main` as `cd9912cd7f87861fbd1a740ca43a45b70aeb01ca`. The blanket release freeze was replaced with satisfactory-quality merge/deploy criteria. This is a policy change only; all hard gates remain.
- **Notification readability:** PR #355 merged to `main` as `32aa87c654ed259f797def61b42e23ecd88f532c`. CI validation/build/preflight passed and Firebase Hosting deploy [43197683195](https://github.com/Mort2307/NightJar-Audio/actions/runs/43197683195) succeeded. Notification titles are at least 14px; supporting summaries at least 12px; rows wrap at a 56px minimum height. Vision Access selections and Midnight Gold styling are preserved.
- **Public-repository secret scanning:** PR #356 merged to `main` as `465f6702d8a3061f6dcd7d80ddd5c04ae0ce3cde`. Six CI checks passed, including the full-history redacted Gitleaks scan [43198773478](https://github.com/Mort2307/NightJar-Audio/actions/runs/43198773478). A scheduled weekly scan and manual dispatch are now available. Reviewed false-positive/public Firebase Web SDK fingerprints are allowlisted by exact path/rule/line only; future findings at other locations still fail. This does not certify Google Cloud API restrictions or GitHub Security alert history.

### Security details still requiring owner evidence
- GitHub repository intentionally remains **public**. The connected account cannot inspect secret-scanning alerts or branch protections/rulesets, and a full review of historical Actions logs/artifacts still requires owner/admin access.
- Firebase web API keys are public client identifiers, not Admin SDK credentials. The current web key remains in `public/service-worker.js` for Firebase Messaging; the auth client reads `VITE_FIREBASE_API_KEY` from build configuration. Owner must verify the production key is restricted to required Firebase APIs, inspect Identity Toolkit quotas and confirm App Check. No `initializeAppCheck` / `enforceAppCheck` source references were found. Firestore client rules default-deny all access; Storage rules restrict owner/role uploads and deny client reads.
- A separate historical Firebase key belonged to a different, older project and is not referenced by current source search. Verify there is no remaining dependency before disabling that key/project.

### Didit: code and backend/Hosting release complete; live provider configuration pending

- The original stale-base PR #353 was closed as superseded. Its current-main successor [PR #358](https://github.com/Mort2307/NightJar-Audio/pull/358) merged as `47c31aa3bfde6aac4ff89746985a1ab60270c7bb`. It distinguishes unsupported document warning codes from genuine image-quality failures, sets `canRetake:false`, and gives members a support/configuration route instead of repeated retakes.
- A final server-side review found that the admin resubmission selector also needed to enforce the same no-retake rule before provider mutation. [PR #359](https://github.com/Mort2307/NightJar-Audio/pull/359) added a hard guard for `DOCUMENT_TYPE_NOT_SUPPORTED`, `DOCUMENT_NOT_SUPPORTED_FOR_APPLICATION` and `NFC_DATA_DOES_NOT_MATCH_OCR`; unsupported outcomes now go to manual review and never reach Didit's update-status PATCH. The selector, unit tests, admin-safe messaging and regression contracts are included in the merged main revision.
- Both Didit releases used the existing backend-first release marker. First selected deployment [43200313790](https://github.com/Mort2307/NightJar-Audio/actions/runs/43200313790) updated the four resubmission callables. The final hardening deployment [43201818856](https://github.com/Mort2307/NightJar-Audio/actions/runs/43201818856) updated and verified the same four callables again: `myDiditResubmission`, `requestDiditResubmission`, `adminListDiditResubmissions`, `adminReviewDiditResubmission`. All are Node.js 22 second-generation Functions in `europe-west2`; Firebase reported successful updates, post-deployment metadata verification passed, and the deployment report recorded zero warnings/errors.
- Matching Hosting release [43201699218](https://github.com/Mort2307/NightJar-Audio/actions/runs/43201699218) completed successfully after the backend gate, and the deployed-version check passed against `c6cbd43a73b2792bbdb1fc1f0a90daf15ca37e1b`. Main build [43201698459](https://github.com/Mort2307/NightJar-Audio/actions/runs/43201698459), validation [43201698668](https://github.com/Mort2307/NightJar-Audio/actions/runs/43201698668) and secret-history scan [43201698542](https://github.com/Mort2307/NightJar-Audio/actions/runs/43201698542) also passed.
- **Still not verified:** this GitHub connection cannot access the live Didit Business Console or Didit workflow API. No live provider settings have been changed or asserted as verified.
- Owner must open the exact *published* production workflow and inspect every OCR/ID Verification node. Confirm `image_capture_methods_allowed` is exactly `["CAMERA_SCAN"]`; `UPLOAD` is disabled; `is_image_capture_review_screen_enabled` is true; the active workflow ID matches the value NightJar uses; and record the existing `id_document_quality_threshold` without changing it absent rejection evidence. Save a full before snapshot.
- Test only a fresh dedicated sandbox QA session: camera is offered, file picker/upload is absent, capture review supports confirm/retake, poor capture can be retaken, and front/back steps match the selected document type. Existing member sessions, prior approvals and account-bound 18+ evidence must remain untouched. Provide a redacted screenshot/export (hide workflow UUID, credentials and member data) to close issue #352.
- The deployed code preserves the documentary 18+ evidence gate. An ID capture or resubmission is never itself an age approval; only the existing signed, account-bound, backend-verified evidence path can unlock access.

### Human/device acceptance is still NOT RUN
- The 16-workstream matrix above is unchanged. The user had previously confirmed Didit and notifications work in general, but complete role/platform evidence is still not recorded.
- Real Android/iOS/desktop acceptance, 320/390/768px layouts, 200% zoom, keyboard/screen-reader, reduced motion, cross-account permissions, real opted-in push deep-links and role-specific end-to-end journeys remain NOT RUN until a test operator records role-only, platform and result.
- There is no separate Firebase staging project. Use designated approved test accounts and non-sensitive content only after the relevant controlled release; do not create new paid Didit sessions or weaken the 18+ gate.

### Non-negotiable safety
- **Never weaken, bypass, remove or make optional the mandatory fail-closed 18+ gate.** Existing approval must remain account-bound; revocation must continue to block access.
- Keep CLOSED_BETA, public signup and charging controls as they are until the separate legal, privacy, age-verification, rights, moderation, payment-provider and security-launch criteria are evidenced and owner-approved.
- Work may be merged/deployed once each coherent change meets the satisfactory quality gate. Non-critical untested work does not freeze unrelated safe work; critical security/privacy/rights/account-isolation/18+ issues block the affected release.