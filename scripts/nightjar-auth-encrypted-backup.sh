#!/usr/bin/env bash
# NightJar Firebase Authentication export — explicit, encrypted, manual recovery step.
# Default mode is read-only and never retrieves user records.
# Requires an offline-held GPG private key and its public key imported into Cloud Shell.
set -euo pipefail
umask 077

PROJECT='nightjar-audio'
MODE="${1:-preflight}"
RECIPIENT_FPR="${NIGHTJAR_BACKUP_RECIPIENT_FPR:-}"
OUTPUT_DIR="${NIGHTJAR_BACKUP_OUTPUT_DIR:-$HOME/nightjar-encrypted-auth-backups}"
TMP_DIR=''
TEMP_OUTPUT=''

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -f -- "$TMP_DIR/auth-users.json" || true
    rmdir -- "$TMP_DIR" || true
  fi
  if [[ -n "$TEMP_OUTPUT" && -e "$TEMP_OUTPUT" ]]; then
    rm -f -- "$TEMP_OUTPUT" || true
  fi
}
trap cleanup EXIT

case "$MODE" in
  preflight|export) ;;
  *) fail 'Usage: bash nightjar-auth-encrypted-backup.sh [preflight|export]' ;;
esac

for bin in gcloud firebase gpg jq mktemp sha256sum stat; do
  command -v "$bin" >/dev/null 2>&1 || fail "$bin is not installed. No records have been exported."
done
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
[[ "$ACTIVE_PROJECT" == "$PROJECT" ]] || fail "Selected project is '$ACTIVE_PROJECT', expected '$PROJECT'."
[[ -d /dev/shm && -w /dev/shm ]] || fail '/dev/shm is not available for in-memory temporary files.'
[[ "$(stat -f -c %T /dev/shm)" == 'tmpfs' ]] || fail '/dev/shm is not tmpfs; refusing plaintext export to disk.'

printf 'NightJar Firebase Auth recovery preflight\n'
printf 'Project: %s\n' "$PROJECT"
printf 'Temporary plaintext location: memory-backed /dev/shm only\n'
printf 'Exports only after explicit approval; no user records printed to terminal.\n'

if [[ -z "$RECIPIENT_FPR" ]]; then
  [[ "$MODE" == 'preflight' ]] || fail 'NIGHTJAR_BACKUP_RECIPIENT_FPR must be set to the full fingerprint of your offline recovery public key.'
  printf 'Public encryption key: NOT CONFIGURED (expected before export)\n'
else
  [[ "$RECIPIENT_FPR" =~ ^[A-Fa-f0-9]{40}$ ]] || fail 'Use an exact 40-digit hexadecimal GPG fingerprint.'
  FPR_UPPER="${RECIPIENT_FPR^^}"
  if ! gpg --batch --with-colons --fingerprint "$FPR_UPPER" 2>/dev/null \
      | awk -F: -v fingerprint="$FPR_UPPER" '$1 == "fpr" && $10 == fingerprint { found=1 } END { exit !found }'; then
    fail 'This public-key fingerprint is not available in GPG. Import your verified PUBLIC key, never the private key.'
  fi
  printf 'Public encryption key: present (fingerprint verified)\n'
fi

if [[ "$MODE" == 'preflight' ]]; then
  printf 'PREFLIGHT ONLY — no Firebase Auth records read or exported.\n'
  exit 0
fi

[[ "${NIGHTJAR_APPROVE_AUTH_EXPORT:-}" == 'YES' ]] || fail 'Explicit approval required: set NIGHTJAR_APPROVE_AUTH_EXPORT=YES for this invocation.'
[[ -n "$RECIPIENT_FPR" ]] || fail 'Encryption recipient is required.'
[[ "$OUTPUT_DIR" == /* ]] || fail 'NIGHTJAR_BACKUP_OUTPUT_DIR must be an absolute path.'
mkdir -p -- "$OUTPUT_DIR"
chmod 700 -- "$OUTPUT_DIR"
[[ -d "$OUTPUT_DIR" && -w "$OUTPUT_DIR" ]] || fail 'Encrypted output directory is not writable.'

TMP_DIR="$(mktemp -d -p /dev/shm 'nightjar-auth.XXXXXXXX')"
chmod 700 "$TMP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="$OUTPUT_DIR/nightjar-auth-$TIMESTAMP.json.gpg"
[[ ! -e "$OUTPUT_FILE" ]] || fail 'An export with this timestamp already exists; rerun after one second.'
TEMP_OUTPUT="$OUTPUT_FILE.partial"
[[ ! -e "$TEMP_OUTPUT" ]] || fail 'A partial encrypted output file already exists; inspect it before retrying.'

# The CLI writes temporarily to memory-backed storage. No plaintext output is printed.
if ! firebase auth:export "$TMP_DIR/auth-users.json" --project "$PROJECT" --format=json --non-interactive >/dev/null; then
  fail 'Firebase Auth export failed. No usable encrypted backup created.'
fi
jq -e '.users | type == "array"' "$TMP_DIR/auth-users.json" >/dev/null \
  || fail 'Firebase Auth export did not contain a JSON users array.'
USER_COUNT="$(jq '.users | length' "$TMP_DIR/auth-users.json")"
[[ "$USER_COUNT" =~ ^[0-9]+$ && "$USER_COUNT" -gt 0 ]] \
  || fail 'Export returned zero user accounts; refusing to declare a successful backup.'
HASHED_COUNT="$(jq '[.users[] | select((.passwordHash // "") != "")] | length' "$TMP_DIR/auth-users.json")"

# Trust is limited to the manually verified exact fingerprint above.
gpg --batch --yes --no-tty --trust-model always --encrypt \
  --recipient "$FPR_UPPER" --output "$TEMP_OUTPUT" "$TMP_DIR/auth-users.json"
[[ -s "$TEMP_OUTPUT" ]] || fail 'Encrypted output is empty.'
chmod 600 -- "$TEMP_OUTPUT"
mv -- "$TEMP_OUTPUT" "$OUTPUT_FILE"
TEMP_OUTPUT=''

# Remove plaintext before reporting success; the EXIT trap is a second safeguard.
rm -f -- "$TMP_DIR/auth-users.json"
rmdir -- "$TMP_DIR"
TMP_DIR=''

printf 'ENCRYPTED EXPORT CREATED (not yet restore-tested).\n'
printf 'User accounts: %s; accounts with exported password hashes: %s\n' "$USER_COUNT" "$HASHED_COUNT"
printf 'Encrypted file: %s\n' "$OUTPUT_FILE"
printf 'SHA-256: '
sha256sum -- "$OUTPUT_FILE" | awk '{print $1}'
printf 'NEXT: Download ciphertext to secured offline storage; verify decryption privately; then remove the Cloud Shell copy.\n'
printf 'IMPORTANT: Save Firebase SCRYPT password-import parameters separately in a secure vault.\n'
