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
readonly PROVIDER_DISPLAY_NAME="Nightjar backend deploy"
[[ ${#PROVIDER_DISPLAY_NAME} -le 32 ]] || { echo "Invalid WIF provider display name length" >&2; exit 1; }
readonly SA_ID="nightjar-backend-deploy"
readonly SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly CONDITION="assertion.repository_id == '${REPOSITORY_ID}' && assertion.repository == '${REPOSITORY}' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == '${REPOSITORY}/.github/workflows/firebase-backend-deploy.yml@refs/heads/main'"
readonly ATTRIBUTE_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name"

for executable in gcloud grep python3; do
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

# Google Cloud resource creation is eventually consistent. A newly created pool
# may return NOT_FOUND on a describe call immediately after creation.
# Recover safely on re-runs instead of creating an existing pool a second time.
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  if ! CREATE_OUTPUT="$(gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project="$PROJECT_ID" \
    --display-name="Nightjar GitHub Actions" --quiet 2>&1)"; then
    if grep -Eiq 'ALREADY_EXISTS|already exists' <<< "$CREATE_OUTPUT"; then
      echo "Pool already exists; checking eventual consistency." >&2
    else
      echo "STOP: Google Cloud rejected pool creation:" >&2
      echo "$CREATE_OUTPUT" >&2
      exit 1
    fi
  fi
fi

wait_for_pool() {
  local attempt pool_path
  for ((attempt=1; attempt<=24; attempt++)); do
    pool_path="$(gcloud iam workload-identity-pools describe "$POOL_ID" \
      --location=global --project="$PROJECT_ID" --format='value(name)' 2>/dev/null)" || pool_path=""
    if [[ "$pool_path" == projects/*/locations/global/workloadIdentityPools/"$POOL_ID" ]]; then
      printf '%s\n' "$pool_path"
      return 0
    fi
    if (( attempt < 24 )); then
      echo "Waiting for Google Cloud to expose workload identity pool (attempt $attempt/24)..." >&2
      sleep 5
    fi
  done
  echo "STOP: Pool nightjar-github still unavailable. Check Google Cloud IAM Workload Identity Pools and project permissions." >&2
  return 1
}

readonly POOL_PATH="$(wait_for_pool)"

# A provider also needs a propagation window after creation. Always validate
# the final condition and attribute mapping, even for newly created providers.
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" >/dev/null 2>&1; then
  if ! CREATE_OUTPUT="$(gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location=global --project="$PROJECT_ID" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="$PROVIDER_DISPLAY_NAME" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$CONDITION" --quiet 2>&1)"; then
    if grep -Eiq 'ALREADY_EXISTS|already exists' <<< "$CREATE_OUTPUT"; then
      echo "Provider already exists; checking eventual consistency." >&2
    else
      echo "STOP: Google Cloud rejected provider creation (no retries for invalid arguments):" >&2
      echo "$CREATE_OUTPUT" >&2
      exit 1
    fi
  fi
fi

PROVIDER_JSON=""
for ((attempt=1; attempt<=24; attempt++)); do
  PROVIDER_JSON="$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" \
    --format=json 2>/dev/null)" || PROVIDER_JSON=""
  if [[ -n "$PROVIDER_JSON" ]]; then break; fi
  if (( attempt < 24 )); then
    echo "Waiting for Google Cloud to expose workload identity provider (attempt $attempt/24)..." >&2
    sleep 5
  fi
done
[[ -n "$PROVIDER_JSON" ]] || {
  echo "STOP: Provider nightjar-main still unavailable; inspect IAM before retrying." >&2
  exit 1
}
ACTUAL_CONDITION="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("attributeCondition", ""))' <<< "$PROVIDER_JSON")"
ACTUAL_MAP="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("attributeMapping", {}).get("attribute.repository_id", ""))' <<< "$PROVIDER_JSON")"
if [[ "$ACTUAL_CONDITION" != "$CONDITION" || "$ACTUAL_MAP" != "assertion.repository_id" ]]; then
  echo "STOP: Provider exists but its trust policy does not match. Never overwrite it automatically." >&2
  echo "Expected condition: $CONDITION" >&2
  echo "Actual condition:   $ACTUAL_CONDITION" >&2
  echo "Repository ID mapping: $ACTUAL_MAP" >&2
  exit 1
fi

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_PATH}/attribute.repository_id/${REPOSITORY_ID}" \
  --quiet >/dev/null

# Cloud Functions (2nd gen) HTTPS callable creation also modifies the
# Cloud Run invoker policy (run.services.setIamPolicy). The Developer role
# cannot perform that step: functions may create successfully but Firebase
# will fail to make new callable endpoints invokable by signed-in users.
# Cloud Functions Admin includes that permission. Avoid Owner/Editor,
# project-wide Service Account User, and any long-lived JSON credentials.
readonly MEMBER="serviceAccount:${SA_EMAIL}"
for role in roles/cloudfunctions.admin roles/firebaserules.admin roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer roles/firebase.viewer; do
  echo "Ensuring project role: $role"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$MEMBER" --role="$role" --quiet >/dev/null
done

# Firebase CLI inspects declared Functions secrets during source analysis,
# including when deploying a single selected Function. Permit metadata inspection
# only for the six known, explicitly declared Nightjar secrets; this role does NOT
# grant secretmanager.versions.access (the secret payload).
# Missing secrets are never created, populated or read by this script.
echo "Granting metadata-only access to declared Nightjar Functions secrets..."
readonly NIGHTJAR_FUNCTION_SECRETS=(
  DIDIT_API_KEY
  DIDIT_WORKFLOW_ID
  DIDIT_WEBHOOK_SECRET
  DIDIT_ENVIRONMENT
  NIGHTJAR_GMAIL_CLIENT_ID
  NIGHTJAR_GMAIL_CLIENT_SECRET
)
missing_secrets=()
for secret_id in "${NIGHTJAR_FUNCTION_SECRETS[@]}"; do
  if gcloud secrets describe "$secret_id" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Granting Secret Manager Viewer (metadata only) on: $secret_id"
    gcloud secrets add-iam-policy-binding "$secret_id" \
      --project="$PROJECT_ID" \
      --member="$MEMBER" \
      --role=roles/secretmanager.viewer \
      --quiet >/dev/null
  else
    echo "WARNING: Cannot inspect secret $secret_id. No access granted; check whether it exists and whether this Cloud Shell user can view it." >&2
    missing_secrets+=("$secret_id")
  fi
done
if (( ${#missing_secrets[@]} > 0 )); then
  echo "WARNING: Missing/unreadable Nightjar secrets: ${missing_secrets[*]}" >&2
  echo "Firebase Functions deployment can fail if it references these secrets." >&2
fi

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
