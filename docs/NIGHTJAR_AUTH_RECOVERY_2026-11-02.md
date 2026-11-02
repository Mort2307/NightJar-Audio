# NightJar — Firebase Authentication recovery (prepared; export NOT executed)

**Project:** `nightjar-audio`  
**Status (2026-11-02):** Read-only live Auth configuration audit completed; encrypted Auth export not yet performed. Production account data is **not** in GitHub, Floot, chat or this repository. This document and its companion script are an operator-controlled preparation, not a claim of recovered accounts.

## Confirmed baseline

- Firebase Auth email/password enabled. MFA was reported disabled; phone and anonymous fields were absent from the filtered output (this is **not** proof those methods were disabled).
- Authorised auth domains: `localhost`, `nightjar-audio.firebaseapp.com`, `nightjar-audio.web.app`, and the temporary PR330 Firebase preview hostname. There was no `nightjar.audio` entry; Firebase Hosting showed only the two default domains, so the custom domain is not confirmed connected. Preserve existing working flows until separately reviewed.
- Firestore database deletion protection: enabled. Firestore schedules: daily retained seven days; weekly Monday retained four weeks. A completed Firestore backup had not yet appeared when checked. Cloud Storage soft delete: seven days. These protections do **not** back up Firebase Authentication users or private audio.

## Threat model and constraints

Firebase CLI `auth:export` can include user UIDs, emails, phone numbers, provider identities, password hashes and salts. Password hash recovery also requires the project's sensitive Firebase SCRYPT hash parameters, which are **not** safely shared in chat or source control. Some imported password types may not export as hashes; Firebase's documented export caveat applies. Firebase Auth export alone does not recreate Firestore profile/role data, Didit verification state, application-specific entitlements, backend secrets, custom claims, or payment provider records. Full recovery requires reconciling identity UIDs and these separate systems.

**Never** export to GitHub, issue attachments, Floot, chat, public buckets, CI artifacts or an unencrypted PC folder. Never import production users into a live test environment. Use a dedicated recovery project with no outgoing emails, payment collection, or verification-provider requests for eventual restoration drills. Validate privacy and retention policies before copying personal records.

## Step 1 — Create the recovery encryption key on a trusted PC

1. Install a reputable OpenPGP tool (for Windows, Gpg4win/Kleopatra). On the **trusted local PC**, generate a recovery keypair with a strong passphrase. Keep the **private key** on the PC or encrypted removable media; do not upload it to Cloud Shell or GitHub.
2. Export **only the public key** (`nightjar-recovery-public.asc`). Record and independently verify its complete 40-character uppercase hex fingerprint in Kleopatra/GPG.
3. Securely duplicate the private key and its unlock passphrase into separate access-controlled, offline recovery arrangements. If the private key/passphrase is lost, encrypted backups cannot be recovered.
4. Upload just the public `.asc` file using Google Cloud Shell's *Upload* option. Cloud Shell is an execution environment, not the long-term backup vault.

## Step 2 — Import the public key into Cloud Shell and run read-only preflight

Use the audited code from `scripts/nightjar-auth-encrypted-backup.sh` on the source branch. Copy it to Cloud Shell or clone this branch from GitHub. Check that it is exactly the script reviewed before running it.

```bash
# Adjust the path if Cloud Shell's Upload saved your public key elsewhere.
gpg --import "$HOME/nightjar-recovery-public.asc"
# Compare this output with the fingerprint you recorded on the OFFLINE PC.
gpg --fingerprint
# No Auth users accessed; no export and no billed resources created.
bash scripts/nightjar-auth-encrypted-backup.sh preflight
```

If the preflight fails, stop and inspect the error. In particular, do not export if `/dev/shm` is unavailable or is not memory-backed `tmpfs`.

## Step 3 — Explicitly approve the one-time encrypted export

**Only after reviewing the destination and encryption fingerprint:**

```bash
# Replace with the EXACT, verified 40-character fingerprint from your local PC.
export NIGHTJAR_BACKUP_RECIPIENT_FPR='PASTE_VERIFIED_40_CHARACTER_FINGERPRINT'
# The script requires explicit opt-in, and refuses a wrong active project.
NIGHTJAR_APPROVE_AUTH_EXPORT=YES bash scripts/nightjar-auth-encrypted-backup.sh export
```

The script:

- Checks the selected project equals `nightjar-audio` and validates the installed recipient's **exact key fingerprint**.
- Writes a temporary JSON export into a restrictive directory in memory-backed `/dev/shm`, **never persistent Cloud Shell home**.
- Confirms a non-empty users array and reports *counts only*. It does not print or commit names, emails, phone numbers, UIDs, password hashes, or keys.
- Encrypts with the verified public GPG key into `$HOME/nightjar-encrypted-auth-backups/` (permissions restricted) and removes temporary plaintext on normal exit; abnormal machine termination is a residual risk until the VM stops. No `shred` guarantees on RAM-backed files.
- Prints encrypted output path and SHA-256 checksum. It does **not** automatically upload the backup, schedule repeated runs, create a GCS bucket, or modify production.

The generated `.json.gpg` file remains **sensitive** and must only be retained in controlled encrypted recovery storage. Download the encrypted file to at least two independent secure locations. Confirm its SHA-256 and successful decryption **privately on the trusted PC**, with no plaintext sent to chat. Remove the Cloud Shell encrypted copy once download and verification are complete.

## Step 4 — Separately escrow Firebase password hash parameters

For password-preserving `auth:import`, Google documents the required SCRYPT configuration: `base64_signer_key`, `base64_salt_separator`, `rounds` and `mem_cost`. Inspect via Firebase Console > Authentication > Users > overflow menu > Password hash parameters. Store them in an appropriate **separate encrypted recovery vault**, not in this repository, logs or chat. Some accounts may require password-reset flows after restoration, depending on how their hashes were originally imported.

A safe recovery rehearsal must confirm UIDs, sign-in, role mapping, email verification behaviour, custom claims (if used), protected media authorisation and Didit/Stripe no-side-effects boundaries. Hash escrow and a user export do not automatically make the project disaster-recovery ready.

## Step 5 — Repeatability and evidence

- Initial manual export can validate the process with **no new cloud storage service charges**, though ordinary Firebase usage/billing still applies. Running `auth:export` consumes API requests and handles confidential personal data.
- The existing Cloud Shell home is **not** an archival destination; it may be deleted after prolonged inactivity. Store encrypted ciphertext off Cloud Shell.
- Document export UTC time, user count, number of accounts with exported hashes, ciphertext SHA-256, offline verification date, secure destination ownership and a retention/deletion review. Do not record sensitive user data in the evidence.
- Automated schedules / private Cloud Storage archival can be considered **later**, with explicit billing/IAM/privacy approval. Do not enable them silently.
- A final recovery drill must occur in an isolated test project and must not import data into or overwrite production.

Official references:
- https://firebase.google.com/docs/cli/auth
- https://docs.cloud.google.com/shell/docs/how-cloud-shell-works
- https://firebase.google.com/docs/firestore/backups
