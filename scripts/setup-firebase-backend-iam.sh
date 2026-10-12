#!/usr/bin/env bash
# Nightjar — one-time GitHub Actions → Google Cloud backend deployment identity.
# Run in an authenticated Google Cloud Shell with permission to manage IAM.
# No Google service-account key JSON, Firebase refresh token or GitHub PAT is created.
set -Eeuo pipefail

readonly PROJECT_ID="nightjar-audio"
readonly REPOSITORY="Mort2307/NightJar-Audio"
readonly REPOSITORY_ID="1389067180"
readonly POOL_ID="nightjar-github"
readonly PROVIDER_ID="nightjar-main"
readonly SA_ID="nightjar-backend-deploy"
readonly SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly CONDITION="assertion.repository_id == '${REPOSITORY_ID}' && assertion.repository == '${REPOSITORY}' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == '${REPOSITORY}/.github/workflows/firebase-backend-deploy.yml@refs/heads/main'"
readonly ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name"

for executable in gcloud grep; do
  command -v "$executable" >/dev/null 2>&1 || { echo "Required command is missing: $executable" >&2; exit 1; }
done

echo "NIGHTJAR — SECURE FIREBASE BACKEND IDENTITY SETUP"
echo "Project: ${PROJECT_ID}"
echo "Repository: ${REPOSITORY} (immutable GitHub ID ${REPOSITORY_ID})"
echo "Identity: ${SA_EMAIL}"
echo "The script creates a constrained workload identity and grants deploy roles."
echo "It does not deploy functions, overwrite data or create private keys."
read -r -p "Type NIGHTJAR to approve IAM changes: " ACKNOWLEDGEMENT
[[ "$ACKNOWLEDGEMENT" == NIGHTJAR ]] || { echo "Cancelled; no IAM changes were made."; exit 1; }

gcloud projects describe "$PROJECT_ID" --format="value(projectId)" >/dev/null
gcloud config set project "$PROJECT_ID" >/dev/null
readonly PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo "Could not resolve project number" >&2; exit 1; }

echo "Checking Google Cloud identity APIs..."
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID" --quiet

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_ID" --project="$PROJECT_ID" \
    --display-name="Nightjar restricted GitHub backend deploy" --quiet
fi

if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project="$PROJECT_ID" \
    --display-name="Nightjar GitHub Actions" --quiet
fi

readonly POOL_PATH="$(gcloud iam workload-identity-pools describe "$POOL_ID" \
    --location=global --project="$PROJECT_ID" --format='value(name)')"
[[ "$POOL_PATH" == projects/*/locations/global/workloadIdentityPools/* ]] || {
  echo "Unexpected workload identity pool path: $POOL_PATH" >&2; exit 1;
}

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  ACTUAL_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" \
    --format='value(attributeCondition)')"
  if [[ "$ACTUAL_CONDITION" != "$CONDITION" ]]; then
    echo "STOP: Existing provider has a different access condition. Review it manually, do not overwrite." >&2
    echo "Expected: $CONDITION" >&2
    echo "Existing: $ACTUAL_CONDITION" >&2
    exit 1
  fi
  ACTUAL_MAP="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" \
    --format=json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("attributeMapping", {}).get("attribute.repository_id", ""))')"
  if [[ "$ACTUAL_MAP" != "assertion.repository_id" ]]; then
    echo "STOP: Existing provider does not map immutable repository_id; review manually." >&2
    exit 1
  fi
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global --project="$PROJECT_ID" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="Nightjar main backend manual releases" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$CONDITION" --quiet
fi

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository_id/${REPOSITORY_ID}" \
  --quiet >/dev/null

# Scope project access to functions development, Rules and index publishing.
# Avoid project Owner/Editor and project-wide Service Account User.
readonly MEMBER="serviceAccount:${SA_EMAIL}"
for role in roles/cloudfunctions.developer roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer; do
  echo "Ensuring project role: $role"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$MEMBER" --role="$role" --quiet >/dev/null
done

# Firebase Functions 2nd gen can use the default Compute runtime identity.
# Grant actAs only on existing runtime/build identities, not on every account.
SA_LIST="$(gcloud iam service-accounts list --project="$PROJECT_ID" --format='value(email)')"
for runtime in \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  "${PROJECT_ID}@appspot.gserviceaccount.com" \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"; do
  if grep -Fxq "$runtime" <<< "$SA_LIST"; then
    echo "Granting Service Account User on existing runtime/build identity: $runtime"
    gcloud iam service-accounts add-iam-policy-binding "$runtime" \
      --project="$PROJECT_ID" --member="$MEMBER" \
      --role=roles/iam.serviceAccountUser --quiet >/dev/null
  else
    echo "No existing runtime/build identity at $runtime — skipped"
  fi
done

PROVIDER_PATH="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location=global --project="$PROJECT_ID" --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"
echo
echo "SETUP COMPLETE — NO BACKEND CODE WAS DEPLOYED"
echo "Add the following under GitHub repository Settings > Secrets and variables > Actions > Variables:"
echo
echo "NIGHTJAR_GCP_WIF_PROVIDER=$PROVIDER_PATH"
echo "NIGHTJAR_GCP_DEPLOY_SERVICE_ACCOUNT=$SA_EMAIL"
echo
echo "After adding both variables, run the GitHub Actions backend workflow"
echo "with scope=auth-check. Do not choose production writes until it passes."
echo "IMPORTANT: default runtime accounts may have elevated permissions; review IAM."
