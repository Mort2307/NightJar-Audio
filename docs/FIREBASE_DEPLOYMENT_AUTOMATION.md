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

The bootstrap grants limited backend *deployment* roles (Cloud Functions Developer, Firebase Rules Admin, Datastore Index Admin, Firebase Viewer and Service Usage Consumer); it grants `roles/iam.serviceAccountUser` only on existing default runtime/build service accounts. Cloud Functions v2 can require additional permissions, depending on function triggers, build service-account configuration and runtime accounts; investigate the exact deployment error rather than granting Owner or Editor. Check whether default runtime service accounts already have overly broad permissions. An identity with `iam.serviceAccountUser` can act with its runtime account's privileges.

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

### 5. Functions rollout and performance

Nightjar's `functions/src/index.ts` is a large module. A first full deployment can still take a long time or hit Firebase deployment limits; GitHub automates the work, not Google's backend rollout latency. Use `functions:selected` for 1–20 exports when testing an incremental change, then deploy remaining batches after results are verified. Functions sharing one codebase may still be rebuilt/uploaded together; selecting functions does not guarantee separate binaries or zero shared-build overhead.

The workflow runs Node.js 22 and a pinned Firebase CLI version (`15.33.0`), prepares Functions only for Functions scopes, validates frontend contracts before writes, and serializes backend releases. It uses Firebase CLI's Application Default Credentials from keyless GitHub OIDC; the historical June 2026 ADC issue was resolved in recent CLI/Node versions, but the `auth-check` must prove the real environment works before making live changes.

## Security and spend

- The existing Hosting credential is stored in GitHub Actions as `FIREBASE_SERVICE_ACCOUNT_NIGHTJAR_AUDIO`. Keep it secret; rotate if exposed.
- Protect `main` with required checks and PR review. Avoid running privileged Hosting PR workflows for forks.
- Firebase deploy can incur paid Cloud Functions/GCP usage, and GitHub Actions workflows consume runner minutes where applicable. Automation reduces manual operations; duplicate CI workflows and deploying numerous Functions still take time.
- For the current CI, `build.yml` and `validate.yml` preserve existing check names; do not disable required branch-protection checks without auditing rulesets.
- Pull-request preview URLs are temporary (seven days). Nightjar's protected backend must still enforce age/authorization regardless of preview Hosting URL.
