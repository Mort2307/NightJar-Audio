# NightJar public launch safety gate

NightJar's `npm run validate:launch` is a **public-launch decision check**, not a routine beta build or an instruction to enable billing. Regular `npm run validate` tests that the policy fails closed; it does not require or set owner declarations.

The checked source must have no age-assurance bypass, must have been deliberately moved out of closed beta, and must retain the live Didit policy gate. In addition, every operator attestation in `scripts/launch-readiness-policy.mjs` must equal the literal value `true` **with dated, independent supporting evidence**:

- `NIGHTJAR_DIDIT_LIVE_VERIFIED`: existing real account access, pending/failed/revoked routes, provider webhook/return, no repeated chargeable sessions.
- `NIGHTJAR_ADULT_PAYMENT_PROVIDER_APPROVED`: explicit written approval for adult-content processing, not merely a working payment form.
- `NIGHTJAR_PAYOUT_SETTLEMENT_VERIFIED`: documented real settlement, creator payout, refund/cancellation and failure-path testing.
- `NIGHTJAR_UK_LEGAL_REVIEW_APPROVED`: qualified UK legal review for creator rights/licences, copyright, privacy, age assurance, consumer and subscription obligations.
- `NIGHTJAR_SECURITY_PRIVACY_REVIEW_APPROVED`: account-role isolation, protected media, prior exposed repository material and privacy/retention reviewed.
- `NIGHTJAR_REAL_DEVICE_ACCEPTANCE_APPROVED`: critical account/auth, upload/retry, protected manuscript, moderation, notification and mobile/desktop tests with recorded results; outstanding items formally accepted or fixed.
- `NIGHTJAR_OWNER_PUBLIC_LAUNCH_APPROVED`: owners explicitly authorise public launch after evidence and unresolved blockers are reviewed.

Attestations are declarations, **not proof**: do not set them simply to get a passing build, and do not treat a passing command alone as launch authorisation. Keep names, private documents, payment credentials, Didit payloads, signed URLs and manuscript data out of CI logs and issues. Store confidential evidence in an appropriately access-controlled location. If a check cannot be verified, leave the gate blocked and continue the restricted beta.

### Engineering scope

This gate does not modify live Didit, payment processing, creator entitlements, moderation or Firebase configuration. It does not run chargeable checks, send email or open registrations. It only guards accidental future release decisions. Human acceptance matrices under #137 and #219 remain authoritative for observed QA; green builds alone must never mark those cases PASS.
