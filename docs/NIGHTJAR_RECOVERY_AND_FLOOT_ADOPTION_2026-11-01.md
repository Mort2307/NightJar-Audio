# NightJar — protected backup and Floot adoption runbook

**Status:** Code snapshot protected; full production disaster recovery **not yet verified**. This document is operator guidance, not evidence that Firestore, Auth, media, or private keys have been backed up.

**Baseline:** `Mort2307/NightJar-Audio` at commit `bb4dc8c37273966f48f427d042b985034f87b4c1`; immutable reference branch `backup/nightjar-2026-11-01-pre-floot`.

**Production:** Firebase project `nightjar-audio`, default Cloud Firestore database, Firebase Auth, Cloud Functions, Firebase Hosting, Storage bucket `nightjar-audio.firebasestorage.app`, Didit and payments integrations. The *actual state* of scheduled backups, bucket protection, external provider configuration and IAM permissions remains to be inspected using authorised access.

## 1. Source code: protected reference versus independent copy

A branch pins a historical source revision, not an independent offsite copy. Download `https://github.com/Mort2307/NightJar-Audio/archive/bb4dc8c37273966f48f427d042b985034f87b4c1.zip` to a secure, independently controlled location; store a SHA-256 checksum. Do not include production secrets or member data in that archive. Confirm a clean `npm ci && npm run validate` and a separate `npm --prefix functions ci && npm --prefix functions run check && npm --prefix functions run build` when restoring from source.

## 2. Read-only inventory from an authorised Google Cloud Shell

Run `bash scripts/nightjar-backup-inventory.sh`. It refuses to run if the selected GCP project is not exactly `nightjar-audio`. It only describes Firestore and bucket backup settings; it does not export data or change any resources. Missing permissions/errors must be reported, not interpreted as an empty backup inventory.

Never paste the full resulting report into public GitHub issues if it exposes unexpected sensitive configuration. Report sanitized outcomes: *schedules present/absent*, *backups present/absent*, *bucket versioning/soft delete present/absent*, and *audit errors*.

## 3. Firestore: use managed backups; then test a restore

Google Cloud Firestore can schedule **one daily and one weekly** managed backup per database. Retention and snapshots are billable; the project must have the relevant billing/Blaze capability. Confirm region and current schedules first; do not blindly create duplicate schedules. The backup remains in the source database's location, so a second independent, appropriately encrypted copy is still recommended for stronger disaster recovery.

**Operator-approved example (NOT run by the audit script):**

```bash
gcloud firestore backups schedules create \
  --project=nightjar-audio \
  --database='(default)' \
  --recurrence=daily \
  --retention=7d
```

The right policy depends on cost, acceptable recovery-point objective, regulatory retention and whether a schedule already exists. Restores should target a **separate new database/project in an isolated recovery exercise**, never the production database. A Firestore managed backup includes documents and index configuration at backup time but does not include TTL policies; capture and restore TTL settings separately. Backups are not equivalent to a complete Firebase project recovery.

A separate Firestore managed export to a locked-down Cloud Storage bucket is possible but adds read/storage charges and requires separate IAM controls. Do not export to a public bucket, GitHub artifact, Floot app, or personal unencrypted download.

## 4. Private audio, artwork, and storage metadata

Inventory the actual production bucket, storage prefix ownership, existing soft-delete/versioning policy and retention settings. These protective features can help with accidental deletion, but **the bucket and its lifecycle settings are not a proven independent backup**.

Prepare an isolated, non-public Cloud Storage backup destination (preferably separately controlled, with encryption, restricted service-account IAM, lifecycle/retention policy and audit logs) for private release audio, cover art and associated metadata. Verify object counts, byte totals, checksums for sampled objects and a restoration to a *private test bucket*. Preserve necessary metadata and access rules; never expose private media through public hosting.

Do not copy protected member/creator uploads into Floot merely to preview UI. Use invented content.

## 5. Firebase Authentication: confidential export

Firebase CLI supports `firebase auth:export` to a local JSON/CSV file with authorised credentials; the exported user list may contain emails, phone numbers, provider IDs, password hashes and salts. Hash configuration (including base64 signer key) is highly sensitive and must be stored separately in an encrypted, access-controlled recovery vault. Some imported hashes are not exportable as ordinary SCRYPT hashes; test the actual recovery path.

**Manual example after confirming secure destination and access (NOT run automatically):**

```bash
umask 077
firebase auth:export ./nightjar-auth-PRIVATE-DO-NOT-SHARE.json --project nightjar-audio --format=json
# Immediately encrypt and transfer via an approved private recovery channel.
# Verify recovery without ever committing, logging or emailing the export.
```

Do **not** upload Auth JSON, Didit evidence, passwords, tokens or verification biometrics to GitHub, Floot, ordinary chat attachments or public artifact storage. Never disclose users' Firebase Auth UIDs or contact details in a backup status report.

## 6. Functions, secrets, Didit, Stripe and operational dependencies

- Source: Cloud Functions and deployment workflow versions are in GitHub; **deployed inventory** and region/resource identity must be reconciled independently, including legacy resources not in current source.
- Configuration: inventory Secret Manager secret *names/versions*, scoped IAM, GCP Workload Identity Federation subjects, DNS/domain ownership, Hosting rewrites, Firebase Auth providers and redirect domains. Escrow required secret values using a security-approved encrypted vault; do not print or copy values into GitHub logs.
- External systems: document payment and verification provider account ownership, API/webhook settings and reference IDs required for reconciliation. Never attempt to clone live Didit ID imagery, face data or payment credentials.
- Keep unrelated provider billing, consent and legal records under their own policies. Do not restore/export beyond applicable privacy and retention duties.

## 7. Recovery drill (required before declaring a full backup)

1. Provision a new, isolated recovery environment with no real outbound email, payment capture or Didit session starts.
2. Restore a managed Firestore backup or encrypted export into a separate database; inspect sample document references, indexes and TTL policies without exposing members.
3. Restore selected protected audio/media to a private test bucket. Check integrity, links, ownership and playback access enforcement.
4. Validate a *controlled* Firebase Auth import for test accounts with the appropriate hashing parameters and account claims; never point the test client at live identities.
5. Build and deploy the exact pinned source; verify Cloud Functions region/routes, rules and Auth access boundaries.
6. Exercise private media authorization, admin/editor roles, creator rights, listener beta entitlements, Didit approved/blocked safety states and rollback.
7. Record actual restoration test date, evidence location, recovery-point/recovery-time objective and approval; only then call the backup **restoration-tested**.

## 8. Floot operating agreement

Floot NightJar Studio Lab: `c5b7e023-9e00-4302-8384-aa1d991d4aee`.

Use only anonymised/synthetic fixtures and port isolated presentation or pure logic. The first NightJar-origin code transferred is `src/platform/calendar-civil-date.ts` → Floot helpers `validPersonalCalendarDate` and `personalCalendarSavedSelection`, with independent Jasmine date/leap-year/DST tests. This does not yet connect to real Firebase and does not prove server or authentication portability.

Do not migrate live users, payments, private media or identity verification to Floot. For a production feature, port the reviewed change **back into the React/Vite GitHub source** and use existing NightJar CI and release gates. A platform migration, if later desired, requires separately approved architecture, data protection impact review, dual-write prevention and an established rollback plan.

## Canonical documentation

- Firestore managed backups: https://firebase.google.com/docs/firestore/backups
- Gcloud backup schedule list: https://docs.cloud.google.com/sdk/gcloud/reference/firestore/backups/schedules/list
- Auth import/export: https://firebase.google.com/docs/cli/auth
- Firestore export/import and billing: https://firebase.google.com/docs/firestore/manage-data/export-import
- Cloud Storage bucket metadata: https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/describe
- Recovery coordination issue: https://github.com/Mort2307/NightJar-Audio/issues/329
