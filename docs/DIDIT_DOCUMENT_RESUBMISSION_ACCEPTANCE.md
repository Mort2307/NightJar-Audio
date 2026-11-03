# NightJar Didit same-session ID resubmission — release acceptance

PR: [#331](https://github.com/Mort2307/NightJar-Audio/pull/331) · 3 November 2026

**Release posture:** Review/test only. Do not merge into main or deploy the new Cloud Functions to production until this matrix has been completed. The ordinary PR Hosting preview uses the currently deployed backend, so it cannot prove new callable behavior.

## Verified design constraints

- Member requests are stored in Firestore without contacting Didit or uploading documents to NightJar.
- The admin desk fetches only pending requests and exposes no raw identity material.
- An authenticated account with an existing, live, server-bound session is required for a request.
- Administrators cannot approve their own requests.
- An explicit cost acknowledgement is required for an owner-approved resubmission.
- Only one provider-supplied documentary OCR node is passed to \`PATCH .../update-status/\`; there is no second \`POST /v3/session/\`.
- An already-Approved ID with missing DOB or a provider-approved adult decision is never recharged: these require reconciliation/returned-data configuration review.
- No automatic retry for ambiguous provider responses, duplicate requests or mid-flight account/session changes.
- At most 2 one-shot provider resubmission attempts and 3 member requests per same linked session; 24-hour cooling-off window between repeated request cycles.
- Existing live session blocks fresh session creation after rejection, expiry, missing evidence or an expired resume link.

## Automated gates

- [ ] \`npm run typecheck\` and \`npm run build\` pass in PR read-only CI
- [ ] \`npm run validate\` including Didit source contracts passes
- [ ] \`npm --prefix functions run check\` and \`npm --prefix functions run build\` pass
- [ ] \`node --test functions/lib/didit-resubmission-guards.test.js\` passes
- [ ] Existing credit Firestore emulator security tests pass
- [ ] No new paid Didit session was created by CI or by opening the admin/member panels

## Hands-on acceptance (must be performed with sandbox or isolated approved testers)

- [ ] Existing-verified adult remains verified and cannot request another check
- [ ] Unverified account with no live linked session cannot request a resubmission
- [ ] Failed/expired documentary ID with a valid existing session can request review
- [ ] Active/in-progress session cannot request or accidentally start another paid check
- [ ] Duplicate member submit and duplicate owner approval do not create two provider PATCH requests
- [ ] One admin sees only the authorised pending queue and cannot review their own request
- [ ] Denial leaves provider untouched, with safe member-facing guidance
- [ ] Approval asks the owner to acknowledge charge and resubmits **only OCR** on the exact saved session
- [ ] The old session ID stays unchanged after resubmission; check refreshed link on an old session
- [ ] Original ID and liveness reports remain in Didit as prior submissions
- [ ] Signed webhook moves the account through Resubmitted and grants verified 18+ only after appropriate approved documentary evidence returns
- [ ] Overall Approved with ID Approved but DOB missing returns needs_manual_review; no billable PATCH occurs
- [ ] Manually blocked/suspended/revoked account is never re-verified by resubmission
- [ ] One-session cap and 24-hour cooldown are enforced across devices
- [ ] Android Chrome/PWA, desktop and iOS Safari resume the existing link without a popup blocker

## Provider prerequisites and cost

- Use a Didit key scoped to the expected workflow with \`write:sessions\` for \`PATCH .../update-status/\`.
- Confirm the published workflow returns documentary DOB and that any dependent liveness/face-match checks do not accidentally reset by the requested OCR step.
- Review credits in Didit's Billing/Usage console **before** authorising new paid attempts. NightJar cannot enforce a provider-wide account balance from these per-member guards.
- Only selected repeated checks are billed; dependent verification modules may still add cost.
- A provider PATCH timeout is **not safe to retry**: inspect Didit's original session, audits and NightJar's \`diditResubmissionRequests\` record.

## Deployment and rollback plan (after review)

1. Deploy the four new callables and modified \`startDiditSession\` with the ordinary protected backend release workflow; inspect real Cloud Function logs and Firestore rules.
2. Confirm callable status endpoints and permissions with test identities before deploying Hosting; older UI must remain safe when backend is released first.
3. Deploy Hosting only after backend checks succeed; validate on desktop and Android/iOS.
4. If issues occur, disable new resubmission actions and revert Hosting first. Review provider state before rerunning anything: resetting Firestore or redeploying must **not** repeat a Didit PATCH.

References:
- https://docs.didit.me/sessions-api/update-status
- https://docs.didit.me/console/manual-review
- https://docs.didit.me/sessions-api/retrieve-session
