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

The frontend reads `VITE_FIREBASE_VAPID_KEY` at **build time** in `src/platform/firebase-push.ts`. A local `.env` file is NOT uploaded to GitHub Actions; without setting this value, a build can pass while disabling push subscription. Therefore the live Hosting workflow **fails before deploying** when the key is missing or malformed. The PR preview workflow emits a visible warning instead.

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

## Backend authentication: keyless GitHub → Google Cloud

Backend release support is intentionally opt-in because the generated Firebase Hosting service account has **Hosting privileges**, not broad Cloud Functions/Rules privileges. Do not give that service account `Owner` or repurpose its JSON key for all Firebase services.

An administrator must perform **one-time** Google Cloud IAM configuration (for example in Cloud Shell). Create a dedicated backend deployment service account, a GitHub Workload Identity Federation pool/provider, and an IAM binding restricted to **this exact repository** and manual workflows on `main`:

```bash
PROJECT_ID=nightjar-audio
REPO=Mort2307/NightJar-Audio
SERVICE_ACCOUNT=nightjar-backend-deploy@${PROJECT_ID}.iam.gserviceaccount.com

gcloud config set project "$PROJECT_ID"
gcloud iam service-accounts create nightjar-backend-deploy \
  --display-name="Nightjar backend deploy automation" \
  --project="$PROJECT_ID"

gcloud iam workload-identity-pools create nightjar-github \
  --location=global --project="$PROJECT_ID" \
  --display-name="Nightjar GitHub Actions"

POOL_PATH=$(gcloud iam workload-identity-pools describe nightjar-github \
  --location=global --project="$PROJECT_ID" --format="value(name)")

gcloud iam workload-identity-pools providers create-oidc nightjar-main \
  --location=global --project="$PROJECT_ID" \
  --workload-identity-pool=nightjar-github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name" \
  --attribute-condition="assertion.repository == 'Mort2307/NightJar-Audio' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'workflow_dispatch'"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository/${REPO}"

gcloud iam workload-identity-pools providers describe nightjar-main \
  --location=global --project="$PROJECT_ID" \
  --workload-identity-pool=nightjar-github --format="value(name)"
```

If any IAM resources already exist, **inspect and reuse** them rather than repeatedly creating them. **The service account also needs narrowly scoped Google Cloud permissions for the exact backend resources being deployed.** Typical permissions cover Firebase Rules administration, Firestore index administration, and (for 2nd-generation Functions) Cloud Functions, Cloud Run, Cloud Build/Artifact Registry and runtime-service-account impersonation. The appropriate minimal permissions depend on current functions/triggers, and must be reviewed in Google Cloud IAM before enabling the manual deployment. Do not grant project-wide Owner/Editor just to bypass a permission error.

In GitHub → **Settings → Environments**, create the `production-backend` environment and add required reviewers if supported on your plan. Restrict allowed deployment branch to `main`. Add environment **variables** (not secrets because these are public resource identifiers):

- `NIGHTJAR_GCP_WIF_PROVIDER` = full `projects/.../locations/global/workloadIdentityPools/nightjar-github/providers/nightjar-main` from the last command.
- `NIGHTJAR_GCP_DEPLOY_SERVICE_ACCOUNT` = `nightjar-backend-deploy@nightjar-audio.iam.gserviceaccount.com`.

Then go to GitHub → Actions → **Deploy Nightjar Firebase backend (manual)** → Run workflow → choose `main` and the exact scope. Recommended: test `firestore:rules` or `storage` separately after validation; never select `all-backend` by default. The workflow runs validation and requires successful keyless authentication. It does **not** use `--force`; deletions/destructive prompts fail closed rather than silently removing functions.

## Security and spend

- The existing Hosting credential is stored in GitHub Actions as `FIREBASE_SERVICE_ACCOUNT_NIGHTJAR_AUDIO`. Keep it secret; rotate if exposed.
- Protect `main` with required checks and PR review. Avoid running privileged Hosting PR workflows for forks.
- Firebase deploy can incur paid Cloud Functions/GCP usage, and GitHub Actions workflows consume runner minutes where applicable. Automation reduces manual operations; duplicate CI workflows and deploying numerous Functions still take time.
- For the current CI, `build.yml` and `validate.yml` preserve existing check names; do not disable required branch-protection checks without auditing rulesets.
- Pull-request preview URLs are temporary (seven days). Nightjar's protected backend must still enforce age/authorization regardless of preview Hosting URL.
