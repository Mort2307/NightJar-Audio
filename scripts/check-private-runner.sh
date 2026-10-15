#!/usr/bin/env bash
# Read-only safety/preflight check. Never prints secrets or registration tokens.
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "::error::Nightjar CI requires a dedicated Linux VM, not a personal Windows shell."
  exit 1
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo "::error::Do not run the Nightjar CI runner as root."
  exit 1
fi

for command_name in bash git node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "::error::Missing required command: $command_name"
    exit 1
  fi
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" -lt 22 ]]; then
  echo "::error::Node.js 22+ is required; found $(node --version)."
  exit 1
fi

# Refuse obvious accidental cloud credentials in the unprivileged CI environment.
for secret_var in GOOGLE_APPLICATION_CREDENTIALS FIREBASE_TOKEN GCLOUD_SERVICE_KEY; do
  if [[ -n "${!secret_var:-}" ]]; then
    echo "::error::$secret_var is configured in the untrusted CI runner; remove it."
    exit 1
  fi
done

if [[ ! -f package-lock.json || ! -f functions/package-lock.json ]]; then
  echo "::error::Nightjar dependency lockfiles are required for reproducible CI."
  exit 1
fi

if command -v df >/dev/null 2>&1; then
  available_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
  if [[ "${available_kb:-0}" -lt 6291456 ]]; then
    echo "::error::Provide at least 6 GiB free disk space for Node and future Android builds."
    exit 1
  fi
fi

echo "Nightjar runner preflight passed: Linux x64, non-root, Node $(node --version)."
echo "No Firebase deployment or credential use is performed by this check."
