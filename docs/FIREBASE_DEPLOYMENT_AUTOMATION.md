# Nightjar Firebase deployments — operations runbook

**Project:** `nightjar-audio` | **Repository:** `Mort2307/NightJar-Audio` | **Production branch:** `main`

## What is deployed and when

| Workflow | Event | Scope | Credential |
| --- | --- | --- | --- |
| `firebase-hosting-pull-request.yml` | Same-repository PR to main | **Hosting preview channel only** | `FIREBASE_SERVICE_ACCOUNT_NIGHTJAR_AUDIO` |
| `firebase-hosting-merge.yml` | Push to main | **Hosting live channel only** | `FIREBASE_SERVICE_ACCOUNT_NIGHTJAR_AUDIO` |
| `firebase-backend-deploy.yml` | **Manual** workflow_dispatch on main, with environment approval when configured | Selected backend (Functions, Firestore rules/indexes, Storage rules) | Short-lived **Workload Identity Federation** |

These deployments do **not** migrate live Firestore data, alter Firebase Authentication users, configure Cloud Messaging certificates or update billing/age-assurance secrets. Firebase Hosting previews use the live Firebase project for client configuration; a preview URL is not a sandbox for backend mutations. Test carefully using controlled test accounts.

## Mandatory production Web Push key

The frontend reads `VITE_FIREBASE_VAPID_KEY` at **build time** in `src/platform/firebase-push.ts`. A local `.env` file is NOT uploaded to GitHub Actions; without setting this value, a build can pass while disabling push subscription. Therefore the live Hosting workflow **fails before deploying** when the key is missing or malformed. The PR preview workflow also fails early if the key is missing or malformed.

1. Open Firebase Console → Nightjar Audio → Project settings → **Cloud Messaging** → **Web Push certificates**.
2. Copy the existing **public** VAPID key (not the private key or a Firebase service account key).
3. Open GitHub → `Mort2307/NightJar-Audio` → **Settings → Secrets and variables → Actions → Variables → New repository variable**.
4. Name it `VITE_FIREBASE_VAPID_KEY` and paste the public key as the value. Alternatively an Actions secret with that exact name works.
5. Rerun the PR preview and verify **vapidConfigured = true** in Nightjar's built-in push diagnostics. Test one actual push on a tester device after live deployment.

**Never** put private credentials in `VITE_` variables; Vite embeds them in client JavaScript.

## Hosting release checklist

1. Check PR changes; verify all Nightjar security and role checks are green.
2. Check Firebase Hosting preview deployment has succeeded. Test auth, profiles, audio upload/streaming, service worker, mobile layout and push readiness.
3. Merge the PR into `main` only after review. The Hosting workflow builds and deploys the exact merged commit if validation and VAPID checks pass.
4. Live smoke test checks `https://nightjar-audio.web.app/version.json` and requires the emitted `sourceCommit` to equal the pushed Git SHA.
5. Observe GitHub Actions → **Deploy to Firebase Hosting on merge**; when green, test `https://nightjar.audio` and the installed PWA. An Actions success is not a replacement for device testing.
6. If a rollout causes a regression, revert the change on `main` and let the pipeline redeploy. Firebase Hosting's Console release history can also roll back Hosting, **but not backend functions/rules/data**.

A local `firebase init hosting:github` generates workflow files that can differ from committed workflows. Before pulling on a Windows checkout with local untracked generated workflows, back up/reconcile them; never discard changes without inspecting the diff. Agent Skills created locally are optional and are not included in this change.

## Backend authentication: one-time Cloud Shell setup (no keys)

The Hosting service account is only used for Hosting. Never grant it broad backend roles.

A dedicated identity uses **GitHub OIDC → Google Cloud Workload Identity Federation → impersonated deploy service account**. Trust is restricted by immutable GitHub repository ID `1389067180`, the `main` branch, the `workflow_dispatch` event and the exact backend workflow path. No service-account JSON key, GitHub personal-access token or Firebase refresh token is required.

### 1. Run the idempotent bootstrap script from Google Cloud Shell

Open [Google Cloud Shell](https://console.cloud.google.com/cloudshell?project=nightjar-audio), sign in with a Google account allowed to manage project IAM, and run:

```bash
curl -fL --retry 3 \
  "https://raw.githubusercontent.com/Mort2307/NightJar-Audio/main/scripts/setup-firebase-backend-iam.sh" \
  -o setup-firebase-backend-iam.sh
less setup-firebase-backend-iam.sh
bash setup-firebase-backend-iam.sh
```

The script asks for the literal word `NIGHTJAR` before it modifies IAM. It checks/reuses an existing service account, WIF pool/provider and role bindings. It refuses to overwrite a differently configured identity provider.

**If setup stops after "Created workload identity pool" with a `NOT_FOUND` describe error:** Google Cloud may not yet expose a newly created pool to reads. Do not delete the pool or service account. Download the current bootstrap script again and rerun it; the script retries resource discovery and safely reuses resources already created. If the error persists after the bounded retries, inspect IAM permissions, correct project, and Cloud Console rather than creating duplicate identities.

**If provider creation returns `INVALID_ARGUMENT: display name must be less than or equal to 32 characters`:** the earlier bootstrap script used a 37-character label. Stop the old script with Ctrl+C rather than exhausting its retries. Download the updated version from `main`, which uses `Nightjar backend deploy` (23 characters) and stops immediately on permanent API validation errors. No duplicate account or pool is needed.

The bootstrap grants limited backend *deployment* roles (Cloud Functions Developer, Firebase Rules Admin, Datastore Index Admin, Firebase Viewer and Service Usage Consumer), plus **Secret Manager Viewer on the six individually declared Nightjar Functions secrets** (metadata only; never secret values); it grants `roles/iam.serviceAccountUser` only on existing default runtime/build service accounts. Cloud Functions v2 can require additional permissions, depending on function triggers, build service-account configuration and runtime accounts; investigate the exact deployment error rather than granting Owner or Editor. Check whether default runtime service accounts already have overly broad permissions. An identity with `iam.serviceAccountUser` can act with its runtime account's privileges.

### 2. Set two repository variables

The script prints these exact variable names and values at the end. Copy them to GitHub → `Mort2307/NightJar-Audio` → **Settings → Secrets and variables → Actions → Variables**:

- `NIGHTJAR_GCP_WIF_PROVIDER` = the script's complete `projects/NUMBER/locations/global/workloadIdentityPools/nightjar-github/providers/nightjar-main` value.
- `NIGHTJAR_GCP_DEPLOY_SERVICE_ACCOUNT` = `nightjar-backend-deploy@nightjar-audio.iam.gserviceaccount.com`.

These identifiers are not secrets. Do not confuse them with the public Web Push VAPID key.

### 3. Create and protect the backend release environment

In GitHub → **Settings → Environments**, create `production-backend`. Set allowed deployment branch to `main` and enable required reviewers when supported by your repository/plan. GitHub can otherwise auto-create a referenced environment without review; a named environment alone is NOT proof of approval.

### 4. Perform the no-write integration test

GitHub → Actions → **Deploy Nightjar Firebase backend (manual)** → **Run workflow** on `main`:

- `scope`: `auth-check` (default)
- `function_names`: leave blank
- `confirmation`: leave blank

The workflow authenticates with a short-lived Google identity and checks the Firebase CLI can see `nightjar-audio`. It does **not deploy anything**.

When this is green, selected backend releases are available:

| Scope | What changes | Required confirmation |
| --- | --- | --- |
| `functions:selected` | Only named exported functions; comma-separated `function_names`, maximum 20 | `DEPLOY-NIGHTJAR` |
| `functions` | All functions in current source (potentially a very large operation) | `DEPLOY-NIGHTJAR` |
| `firestore:rules` | Replaces live Firestore rules with `firestore.rules` | `DEPLOY-NIGHTJAR` |
| `firestore:indexes` | Applies indexes from `firestore.indexes.json` | `DEPLOY-NIGHTJAR` |
| `storage` | Replaces live Storage rules with `storage.rules` | `DEPLOY-NIGHTJAR` |
| `all-backend` | All above; advanced last-resort release | `ALL-BACKEND-NIGHTJAR` |

Existing Firebase Rules in the Console can be overwritten by CLI deployment. Review diffs, backups, and access paths before changing the production rules. Never use `--force` for backend deployments: missing functions or destructive changes must not be silently deleted.

### Functions secret metadata access

During the first `functions:selected` test (GitHub Actions run `38234520414`), authentication, full validation and TypeScript compilation succeeded, but Firebase CLI failed source preparation on `secretmanager.secrets.get` for `DIDIT_API_KEY`. Firebase can examine secret bindings across the Functions codebase even for a targeted `brandIcon192` deployment.

The bootstrap grants `roles/secretmanager.viewer` **per secret**, not project-wide, for the existing declarations:

- `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_ENVIRONMENT`
- `NIGHTJAR_GMAIL_CLIENT_ID`, `NIGHTJAR_GMAIL_CLIENT_SECRET`

Viewer can inspect metadata and versions but **cannot access secret payloads** (requires `secretmanager.versions.access`). If any of these secrets do not exist or the administrator lacks permission to inspect them, the script warns and skips rather than creating a secret or granting a broad project role. New secrets added in the future must be approved and included explicitly in the allowlist.

To apply this after a previous bootstrap success, re-download the latest `scripts/setup-firebase-backend-iam.sh` from `main` in Google Cloud Shell and rerun it. Re-running reuses existing IAM resources. After the metadata grants, start a **new** `functions:selected` workflow run, not a retry against an outdated commit. Never paste secret values into chat or GitHub Actions logs.

### 5. Functions rollout and performance

Nightjar's `functions/src/index.ts` is a large module. A first full deployment can still take a long time or hit Firebase deployment limits; GitHub automates the work, not Google's backend rollout latency. Use `functions:selected` for 1–20 exports when testing an incremental change, then deploy remaining batches after results are verified. Functions sharing one codebase may still be rebuilt/uploaded together; selecting functions does not guarantee separate binaries or zero shared-build overhead.

The workflow runs Node.js 22 and a pinned Firebase CLI version (`15.33.0`), prepares Functions only for Functions scopes, validates frontend contracts before writes, and serializes backend releases. It uses Firebase CLI's Application Default Credentials from keyless GitHub OIDC; the historical June 2026 ADC issue was resolved in recent CLI/Node versions, but the `auth-check` must prove the real environment works before making live changes.

## Intelligent release planning and production reporting

**Read-only pull-request plan:** `.github/workflows/firebase-backend-plan.yml` runs on backend-related same-repository PRs. It checks out full Git history, compares the PR against its actual base commit, parses `functions/src/index.ts` using TypeScript's AST, identifies changes to named `export` declarations and groups candidates into batches of up to 10 (never more than 20). Results appear in the GitHub Actions job summary and a 14-day JSON artifact. It has **no Google Cloud credentials** and cannot deploy.

**Conservative shared-code rule:** Nightjar's large `functions/src/index.ts` contains shared imports, helpers, types and initialization. If any shared top-level code changes, or an imported module, dependency, runtime/configuration file or export is removed, the plan says **review-required** and does not claim a complete safe function list. Only isolated changes to named export statements receive candidate batches. Those batches are advisory: even a directly changed export might be called by another function. Diff analysis cannot establish runtime dependencies or guarantee safety.

**Manual planning:** GitHub Actions → **Deploy Nightjar Firebase backend (manual)** → select `plan` (read-only). `compare_ref` optionally accepts a full 40-character Git commit SHA for the last relevant backend release. If omitted, the workflow compares to `HEAD~1` and visibly warns that this is **only the previous Git commit**, not necessarily the last backend deployment. `auth-check` remains the default, and neither `plan` nor `auth-check` can modify Firebase.

**Release approval:** A human must review the plan, confirm shared dependencies, choose scope `functions:selected`, paste up to 20 function names, supply `DEPLOY-NIGHTJAR`, and use the `main` branch. The `production-backend` environment should be restricted to `main` with required reviewers where the GitHub plan supports them. No automated Functions deployment occurs on PR merges. The selected service is still a single Functions codebase, so batching can reduce active updates but **not** eliminate source analysis/build/upload cost.

**Production report:** Every manual backend run writes a human-readable GitHub Actions summary and a sanitized JSON artifact (retained for 30 days) with requested scope, selected functions, commit, job status, timed Firebase deploy step, names and regions explicitly confirmed as updated in the Firebase CLI output, warning/error counts and post-deploy checks. Raw Firebase CLI output remains in protected job logs; **raw logs and secret values are not uploaded in the artifact**. A successful workflow alone does not demonstrate that every target was updated; check the confirmed-update list.

**Safe post-deployment verification:** For Functions releases, the workflow sets up Google Cloud CLI using the existing keyless identity and reads Cloud Functions v2 metadata to confirm deployed targets are in `ACTIVE` state. It makes a bounded, public GET request **only** to the explicit Hosting allowlist of branding endpoints (`brandIcon192`, `brandIcon512`, `brandIconMaskable512`, `brandLogoImage`, `brandInstallManifest`). HTTP 200 indicates reachable; HTTP 404 is **inconclusive** because branding assets may be unconfigured. Unexpected HTTP statuses and metadata failures fail verification rather than silently passing. No account actions, age verification, token issuance, messaging, payments, webhooks or scheduled functions are invoked. Callable/event handlers receive metadata checks only. It does **not** prove a particular code commit is serving live traffic, nor does it validate private user flows; retain user acceptance testing.

For Firestore indexes/rules and Storage rules, the CLI deploy status and duration are reported but a safe, non-mutating policy test is **not yet provided**. Do not interpret a green report as proof of policy correctness; use emulator security tests and manual staging review before production policy changes. Roll back by re-deploying the reviewed previous configuration.

**Failure semantics:** Firebase deploy uses `set -o pipefail` even while capturing logs with `tee`. The final report always runs when the job fails and contains no payload from secrets. If Cloud Functions deployment succeeded but a subsequent metadata or public-GET probe failed, the workflow is marked failed, and the report distinguishes that condition from deployment failure; inspect Firebase Console before rerunning to avoid unnecessary production writes.

**Automated tests:** `scripts/firebase-backend-tools.test.mjs` verifies export-only change detection, shared-code fallbacks, removed functions, batch limits, parsing deploy confirmations, report integrity and a mocked benign HTTP probe. These tests run in Nightjar's standard GitHub validation checks.

## Security and spend

- The existing Hosting credential is stored in GitHub Actions as `FIREBASE_SERVICE_ACCOUNT_NIGHTJAR_AUDIO`. Keep it secret; rotate if exposed.
- Protect `main` with required checks and PR review. Avoid running privileged Hosting PR workflows for forks.
- Firebase deploy can incur paid Cloud Functions/GCP usage, and GitHub Actions workflows consume runner minutes where applicable. Automation reduces manual operations; duplicate CI workflows and deploying numerous Functions still take time.
- For the current CI, `build.yml` and `validate.yml` preserve existing check names; do not disable required branch-protection checks without auditing rulesets.
- Pull-request preview URLs are temporary (seven days). Nightjar's protected backend must still enforce age/authorization regardless of preview Hosting URL.

## Administrator Attention rollout (manual, admin-only)

Nightjar has a separate Administrator Attention preference panel under Settings > Notifications, visible only to verified Administrators. Ten Firestore listeners issue discreet administrator push alerts for new professional applications, releases, scripts, images, reviews, Editor portfolios, flagged content, security, recommendations and billing exceptions. Each administrator can mute categories without affecting standard users.

Backend deployment remains deliberately manual and scoped to the fixed admin-attention preset: ten Firestore listeners, two preference callables and the live listNotifications callable. The preset does not alter rules, secrets, payments or unrelated Functions.

1. Go to https://github.com/Mort2307/NightJar-Audio/actions/workflows/firebase-backend-deploy.yml and select Run workflow on main.
2. First select scope=auth-check (no writes). The run must pass.
3. Rerun with scope=admin-attention, confirmation=DEPLOY-NIGHTJAR. Approve the production-backend environment if required.
4. Require full validate/build, deployment and read-only post-deploy metadata verification to pass before announcing the backend live.
5. Test a controlled new moderation item from a non-admin test account, check the Administrator notification feed and Android push, then review/resolve the test item.

IMPORTANT: The workload identity provider explicitly requires assertion.event_name == 'workflow_dispatch' and the matching backend workflow_ref. An earlier push-triggered workflow was correctly rejected by its Google Cloud attribute condition (unauthorized_client). Do not weaken the provider policy; use the authorised manual workflow dispatch. Cloud Functions deployments and runtime triggers may incur Firebase/Google Cloud charges.

