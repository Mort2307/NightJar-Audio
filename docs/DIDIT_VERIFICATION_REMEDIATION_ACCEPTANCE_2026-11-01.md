# Didit: actionable member diagnostics — release and privacy acceptance

**Review date:** 1 November 2026. **Scope:** PR #323 (member-safe warning codes) stacked on PR #321 (Functions dependency security upgrade).

## Already live

PR #322 introduced the user's **What needs attention?** section on Hosting. It identifies missing Terms/Privacy acceptance, unticked age-check consent, an existing resumable session, an account requiring support, and updated age-verification notice acknowledgement. Live Hosting SHA: `8d242d36446d15ff283a0e9dda918a6f012a5058`.

## Backend patch (NOT YET LIVE)

- Only HMAC-authenticated, account- and workflow-bound provider events may update NightJar's limited reasons.
- One **allowlisted** code per genuine documentary, camera or face-match result; unsupported/unparseable/risky codes are dropped. No names, dates of birth, document images, face frames, session IDs, URLs, raw warnings, scores or provider decision objects are copied into these member reason fields.
- An overall Declined, In Review or Approved is *not* enough to assert a specific failed step.
- Reset old codes on a newly bound check and clear on successful adult approval.
- No new Didit sessions are launched to fetch reasons. Missing historical warnings mean generic wording rather than invented details.
- Server authority alone decides whether identity verified. This diagnostic feature must never grant verification, change professional roles or bypass paid access.
- Optional read-only safe reason list must be account-bound for members and owner-only for admin inspection.
- Use `[nightjar-didit-member-reasons-release]` on the **reviewed main merge** only after PR #321 is merged and its backend rollout is safely coordinated. Hosting waits for the backend selected-function deployment and confirmation.

## Acceptance matrix — do not infer manual PASS from CI

| Case | Expected result | Status |
| --- | --- | --- |
| Current signed Approved + valid 18+ documentary evidence | Verified; no old failure notices | NOT RUN on real device |
| Current signed Declined with DOCUMENT_EXPIRED | Explain expired ID; continue only through a provider-authorised existing-session resubmission | NOT RUN |
| Current signed Declined with no recognised warning | Explain review is needed, not a fabricated document or liveness fault | NOT RUN |
| Current signed NO_FACE_DETECTED | Explain camera positioning and access, **not** a fraud accusation | NOT RUN |
| Current signed LOW_FACE_MATCH_SIMILARITY | Suggest NightJar review without exposing score or biometric data | NOT RUN |
| Non-allowlisted fraud/risk warning in genuine event | Never shown to the member; no sensitive reason stored | NOT RUN (contract verified) |
| Unsigned, other-UID or wrong-workflow event | Ignored; no member-visible reason, no age access | NOT RUN (contract verified) |
| Missing NightJar legal acknowledgements / age-check consent | Shows precise missing box; never starts a chargeable session merely by viewing | LIVE UI; device acceptance NOT RUN |
| Existing Didit session with no resume URL | Offers support/recovery; never retries paid check automatically | LIVE UI; device acceptance NOT RUN |
| Two accounts, return-to-app, phone camera deny/re-enable | Each sees only their own safe diagnostics, camera permission in provider browser | NOT RUN |
| Updated notice on already verified account | Acknowledgement only; no new ID capture required | NOT RUN |

## Blockers and rollout

- Current production Functions have six moderate dependency advisories tracked in issue #318. PR #321 has a green isolated lockfile audit and PR emulator checks, but is not yet merged/deployed. The backend release must not suppress dependency audit failures.
- The revised Didit webhook event processor and all dependent selected callables must be deployed before any Hosting change assumes these new fields exist. Neither a green frontend test nor a PR preview updates production Cloud Functions.
- Any unexpected document/liveness values must fail closed to generic status. Inspect exact Didit workflow warnings in an authorised account; do not post identity material to GitHub.
- Retain existing account approval, permissions, creator rights and NightJar closed-beta controls.
