# Nightjar — Didit age assurance (Yoti retired)

Nightjar uses **Didit** for age assurance. Previous Yoti UI wiring is retired and preserved only in Git history. One live approval is stored in the existing server-only Firestore `ageAssurance/{firebaseUid}` document. Every device authenticates to Firebase and reads the same account-level result. No reusable bearer pass token is sent to the browser, and no raw ID/face/biometric data is retained by Nightjar.

## Apply the integration

The repository contains a one-time, idempotent source installer because `functions/src/index.ts` is large and must be patched against the **current** copy, not overwritten with an older snapshot. The change is intentionally **not yet deployed**.

```powershell
git pull origin main
git switch didit-verification-integration
npm ci
npm --prefix functions ci
node scripts/apply-didit-integration.mjs
npm run typecheck
npm --prefix functions run check
npm run validate:contracts
npm run validate:release-hardening
git diff --check
```

Run the installer **before committing/merging**; `git diff` must show changes to `functions/src/index.ts`, `functions/src/nightjars.ts`, `src/App.tsx`, `src/platform/firebase-age.ts`, `firebase.json`, and `scripts/launch-readiness.mjs`. If an anchor changed, the installer fails without silently guessing; inspect the relevant file.

## Closed-beta LIVE Didit pilot (October 2026)

Nightjar's closed beta continues with `TESTING_AGE_ASSURANCE_BYPASS = true` and
`CLOSED_BETA = true`. To safely exercise real Didit while those testers are
using the app, `DIDIT_LIVE_PILOT_ADMINS_ONLY = true` denies chargeable session
creation to all non-admins. Temporary access never becomes a Didit approval.

One-command production configuration (credentials supplied privately in the local
Windows terminal, never in chat or Git):

```powershell
git pull --ff-only origin didit-verification-integration
npm run setup:didit:live
```

This connects the **NightJar Audio app** (not the separate sandbox Didit app)
to the existing **nightjar-audio** Firebase project. It verifies the live Didit
key using workflow/destination listing, lists real workflows without incorrectly
requiring an API response `status: published`, and creates or reuses a V3
destination at `https://nightjar-audio.web.app/api/webhooks/didit`. When an
existing destination is reused its **current** signing secret is prompted for.
The wizard requires operator confirmation that the workflow declines under-18s;
it **does not prove the rule exists** and **does not create a chargeable session,
deploy, modify tester access or disable beta flags**.

The webhook additionally requires an approved V3 `id_verifications[]` result
with a valid DOB showing at least 18 completed years (checked in memory,
persisting only a yes/no adult-evidence flag). A generic KYC `Approved` event
without documentary age evidence stays `PENDING_REVIEW` and never grants
adult access. Adaptive age-estimation-only workflows require separate age
evidence support and are **not** approved by this documentary-only adapter.
Do not launch publicly without verifying the full UK age-assurance requirements
and the provider's 18+ risk, fallback and document rules.

An explicit button in the **Nightjar admin console** starts a potentially
chargeable real Didit check for the administrator's own account. It is protected
both in the UI and in the Cloud Function, so bypassed non-admin testers continue
using Nightjar without being charged or prompted. Successful results are
persisted on their Firebase account. Test invalid signatures, minors, incomplete
checks, revocation, and second-device access before removing beta limits.

Live secrets are stored in Firebase Secret Manager and only become active after
redeploying the functions that bind them. Do not share API keys or webhook
secrets with ChatGPT, in GitHub issues, logs, or documentation.

## Configure Didit Console

Create and test a **User Verification / adaptive age verification workflow with a minimum age of 18** (with appropriate ID fallback and liveness/risk handling). Confirm the workflow is appropriate for UK adult-content age assurance and contractual platform requirements before production. Do not use a generic identity-only workflow.

Add one webhook destination for Nightjar pointing to the deployed endpoint **/api/webhooks/didit** on Nightjar's Firebase Hosting domain (or the deployed Cloud Function URL). Subscribe to exact names:

```json
["status.updated","data.updated","user.status.updated","user.data.updated","business.status.updated","business.data.updated","activity.created","transaction.created","transaction.status.updated","travel_rule.status.updated"]
```

The receiver verifies `X-Signature-V2` (Unicode-preserved canonical JSON), or full-body `X-Signature`, in constant time, and rejects timestamps older than 5 minutes. `X-Signature-Simple` is intentionally unsupported. The endpoint acknowledges *only after the event is durably stored*, then a Firestore trigger processes it asynchronously and idempotently.

It accepts all event families; only linked **user-verification session** updates may approve a Nightjar account. Other events go into the restricted event ledger for future workflows. User `BLOCKED` or `FLAGGED` notices suspend an existing account-level Didit pass pending review. No webhook can mint an approval from only `vendor_data`; a server-created Didit session with matching workflow and environment is required.

## Set Firebase secrets (never commit or paste their values)

```powershell
firebase use nightjar-audio
firebase functions:secrets:set DIDIT_API_KEY
firebase functions:secrets:set DIDIT_WORKFLOW_ID
firebase functions:secrets:set DIDIT_WEBHOOK_SECRET
firebase functions:secrets:set DIDIT_ENVIRONMENT
```

Set `DIDIT_ENVIRONMENT` to **sandbox** for sandbox tests or **live** for the correct production API key, workflow, and destination secret. Each secret is supplied interactively via Firebase CLI. Production and sandbox destination signing secrets must not be mixed. Live verification is *only* accepted when Didit marks an event `environment: "live"`.

Use `firebase deploy --only functions,hosting` **only after local validation** (the server-side age gate changes across many functions, so deploy the entire functions codebase, not just the webhook).

## Validation sequence

1. Try webhook from Didit Console using a signed event; it should return 202 (or 200 for a duplicate). Bad signature, stale timestamp and invalid method should be rejected.
2. Create a **real app-generated Didit sandbox session** using `startAgeAssurance`; verify that the actual `vendor_data` matches the Firebase UID. Use the correct workflow, destination and environment.
3. Complete an Approved sandbox check. Observe `diditSessions`, `diditWebhookEvents`, and `ageAssurance` in Firestore. **Sandbox must not grant a production pass**.
4. Complete a Declined / In Review / Expired / Resubmitted scenario, verifying correct status and replay handling. Resent `event_id` must not create a second decision.
5. With **production** keys and a validated 18+ age workflow, verify an invited adult. Confirm `provider: didit`, `environment: live`, `verified: true`, `status: COMPLETE`. Sign in to a second device: it should show the same pass and **not** call `POST /v3/session/` again.
6. Test suspended accounts, revoked status, identity-boundary checks, simultaneous starts, old webhook deliveries, and cloud function cold starts.

The current `TESTING_AGE_ASSURANCE_BYPASS` and `CLOSED_BETA` flags remain enabled for controlled QA. **They must be explicitly disabled in both `functions/src/index.ts` and `functions/src/nightjars.ts` before public launch.** A test bypass is *not* a Didit production result. Production launch readiness also requires an operator attestation (`DIDIT_LIVE_CONFIG_ACK=yes` when running `npm run validate:launch`), in addition to technical and legal testing. That acknowledgement alone is not proof of regulatory compliance.

## Retention and cost

Store only the Didit session ID, Firebase UID, workflow ID, provider status, minimal event metadata and timestamps. `ageAssurance` and event ledgers are **Firestore server-only** under the project's deny-all client rules. No ID images, facial templates, birthdates or full decision bodies are stored.

A signed live Approved status updates the existing account-level verification; next login reads Firestore, not the Didit API. Repeated logins/new devices don't incur additional verification charges. New sessions are created only for accounts requiring a new or expired check; a Firestore transactional claim limits concurrent creation. A verification can still be required again following revocation, fraud concerns, or legal requirements.

More information: https://docs.didit.me/integration/webhooks and https://docs.didit.me/sessions-api/create-session
