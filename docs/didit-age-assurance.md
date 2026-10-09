# Nightjar · Didit 18+ age verification

Didit is the **only active verification provider**. Earlier Yoti/sandbox work is **retired and reserved for historical reference only**. Do not mix providers' verification states.

## Architecture

1. An email-verified Firebase user opens Nightjar's age gate.
2. The callable `startAgeAssurance` uses the server-side Didit key to create a KYC **18+** workflow session, with `vendor_data` set to the Firebase Auth UID.
3. A pending session is reused for six hours (including across devices), to avoid duplicate paid checks from refreshing or double clicking.
4. Didit redirects the user to Nightjar; signing in on the same or another device invokes the existing `ageStatus` callable.
5. Didit delivers a signed POST webhook. `diditWebhook` authenticates and enqueues its metadata in Firestore, then immediately returns `202`.
6. A retryable Firebase Firestore trigger fetches the current decision from Didit's V3 API and matches session ID, workflow ID, Firebase UID and environment. A **live Approved** decision on the confirmed 18+ workflow updates `ageAssurance/{uid}` with `verified:true`, `provider:'didit'`, `environment:'production'`, `verifiedAt`, and an opaque provider session reference.
7. Every subsequent login checks the **server-side Firebase UID record**. No browser-stored bearer pass token, and **no additional Didit session/bill** while that record remains valid.
8. A re-verification flag, explicit revocation, or an expired/declined provider decision can block access; a fresh Didit check is then required. A sandbox approval **never** unlocks the adult catalogue.

Access to Firestore from web/mobile remains `allow read,write: if false`; only authenticated server callables and Cloud Functions read these sensitive records.

### Data minimisation

Persist status, dates and opaque Didit session/workflow identifiers for audit. Never persist Didit identity scans, DOB, selfies, facial embeddings or full decisions. For failed signature diagnostics log **only SHA256 of raw body**, not unverified biometric/PII payloads.

## Set up on your machine (no credentials in git, browser, or chat)

In the project root:

```powershell
firebase use nightjar-audio
firebase functions:secrets:set DIDIT_API_KEY
firebase functions:secrets:set DIDIT_WEBHOOK_SECRET
```

The *first* secret is the Didit API key, and the *second* is the unique **secret_shared_key for your Didit webhook destination**. Do not confuse them.

Create or update `functions/.env.nightjar-audio` (never commit a real key):

```dotenv
DIDIT_WORKFLOW_ID=REPLACE_WITH_YOUR_KYC_18PLUS_WORKFLOW_UUID
DIDIT_APPLICATION_ID=REPLACE_WITH_YOUR_DIDIT_APPLICATION_UUID
DIDIT_ENVIRONMENT=sandbox
DIDIT_RETURN_URL=https://nightjar-audio.web.app/
DIDIT_PRODUCTION_APPROVED=false
DIDIT_ADULT_WORKFLOW_CONFIRMED=false
# Optional only if Didit uses a branded hosted-verification domain:
# DIDIT_VERIFICATION_HOST=verify.your-approved-domain.example
```

The environment vars above are **configuration identifiers, not secrets**; retain them in the local Firebase Functions env file. `DIDIT_RETURN_URL` must be an allowed Didit callback/return URL.

Deploy (only after local validation):

```powershell
npm ci
npm run typecheck
npm run build
npm run validate:contracts
cd functions
npm ci
npm run check
npm run build
cd ..
firebase deploy --only functions:ageStatus,functions:startAgeAssurance,functions:diditWebhook,functions:processDiditWebhookEvent,hosting
```

Register a destination in Didit Business Console → API & Webhooks to POST to:

`https://nightjar-audio.web.app/api/webhooks/didit`

Choose V3, HMAC signed deliveries, and subscribe to the **exact** desired values: `status.updated`, `data.updated`, `user.status.updated`, `user.data.updated`, `business.status.updated`, `business.data.updated`, `activity.created`, `transaction.created`, `transaction.status.updated`, `travel_rule.status.updated`. These are all accepted, but only the two session events can grant age access; business/entity/transaction events are stored separately as minimal audit metadata. You may choose to subscribe only to the two session event types for a minimal age-check destination.

Use Didit's **Try Webhook** tool and then a real end-to-end sandbox session. An arbitrary Try Webhook fixture cannot upgrade a user account because its session has not been created and bound by Nightjar.

## Live cutover (not performed automatically)

1. Verify the chosen **KYC adult 18+** workflow, feature thresholds, risk handling, and suitable Ofcom-compliant implementation. An 'Approved' generic identity check is not proof of 18+ by itself.
2. Confirm that Didit authorises the intended adult audio business use case, and verify account/user-consent and privacy notices.
3. Use Didit live API credentials / live webhook signing secret and set `DIDIT_ENVIRONMENT=live`. **Separate live and sandbox callbacks and secrets where possible**, or cut over the destination atomically.
4. Set `DIDIT_ADULT_WORKFLOW_CONFIRMED=true` **only after confirming the age threshold and workflow settings**. Set `DIDIT_PRODUCTION_APPROVED=true` only after the live webhook has passed a real signed end-to-end test.
5. Before public launch, disable `TESTING_AGE_ASSURANCE_BYPASS`, retire `adminAgeTestPass` development uses and update the explicit `AGE_ASSURANCE_CONFIGURED` launch-readiness flag in `functions/src/index.ts`; keep `CLOSED_BETA` enabled until you actually open registration.
6. Complete `npm run validate:launch` only after the closed beta is genuinely over.

**Do not deploy a sandbox verification result as a live pass.** Never distribute a reusable device token that could be copied to grant adult access. The pass belongs to the authenticated server-side UID.

## Webhook verification / retries

The HTTPS handler uses the untouched Firebase `request.rawBody`; it verifies the timestamp is within ±300 seconds and checks Didit's V2 canonical JSON HMAC (or raw-body HMAC fallback) using constant-time hex comparison. Deprecated `X-Signature-Simple` is intentionally **not accepted**. JSON is parsed only for V2 signature canonicalisation before any field is trusted.

Each valid event is durably queued once by `event_id` and acknowledged with HTTP 202. The worker retries transient Didit API failures; no sensitive `decision` objects enter Firestore. Real signed entity/transaction messages cannot grant age access. A blocked live Didit user event revokes a matching existing Didit account pass.

## Legacy work reserved

Yoti assets are not deleted from historic branches/source dumps, but no Yoti integration or credentials are referenced by the live age-assurance UI or functions. The callable names `ageStatus` and `startAgeAssurance` are preserved for compatibility while the provider implementation is now Didit.
