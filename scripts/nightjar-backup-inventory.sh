#!/usr/bin/env bash
# NightJar read-only cloud recovery inventory — never exports identity data,
# changes a cloud resource, or writes secrets to a log.
set -euo pipefail

PROJECT="nightjar-audio"
DATABASE="(default)"
BUCKET="gs://nightjar-audio.firebasestorage.app"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "ERROR: gcloud is required. Run this from an authenticated Google Cloud Shell." >&2
  exit 1
fi
CURRENT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$CURRENT" != "$PROJECT" ]]; then
  echo "ERROR: Cloud project must be $PROJECT; active project is ${CURRENT:-unset}." >&2
  echo "Select the correct Cloud Shell project explicitly before rerunning." >&2
  exit 1
fi

echo "== NightJar recovery audit (READ ONLY) =="
echo "Project: $PROJECT"
echo "Database ID: $DATABASE"
echo "Storage bucket: $BUCKET"
echo "No member data, audio, keys, or secrets are being exported."
echo

echo "== Firestore database metadata =="
gcloud firestore databases describe --database="$DATABASE" --project="$PROJECT" --format="yaml(name,locationId,type,pointInTimeRecoveryEnablement)"
echo

echo "== Firestore backup schedules =="
gcloud firestore backups schedules list --database="$DATABASE" --project="$PROJECT" --format="table(name,recurrence,retention)"
echo

echo "== Existing Firestore managed backups =="
gcloud firestore backups list --project="$PROJECT" --format="table(name,database,state)"
echo

echo "== Cloud Storage protection (not an audio backup) =="
gcloud storage buckets describe "$BUCKET" --project="$PROJECT" --format="yaml(name,location,versioning,softDeletePolicy,retentionPolicy)"
echo

echo "Audit completed. A backup is only RECOVERABLE after a separate restore test."
echo "Firebase Auth export, media archive, Secret Manager escrow and recovery testing"
echo "must be handled securely and separately; none are performed by this script."
