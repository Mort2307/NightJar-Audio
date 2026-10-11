# Nightjar — repair Firebase passkey token signing

## Symptom

The device successfully finds/verifies a Nightjar passkey, but the unlock screen says:

> Your passkey verified, but Nightjar needs its Firebase service-account token-signing permission repaired. [503]

Diagnostic: `LOGIN_VERIFY / functions/unavailable`.

The WebAuthn assertion has succeeded. The Cloud Function `finishPasskeySignIn`
cannot mint a Firebase custom authentication token using the Google-managed
runtime service account. Fix IAM, not the fingerprint enrollment or UI.

## Secure production repair (Google Cloud Shell)

1. Sign into the Google Cloud console with an account authorized to manage
   IAM in the **nightjar-audio** project.
2. Open Cloud Shell. Copy these commands as separate steps. The first command
   prints the *actual deployed* service-account email; **do not guess one**.

```bash
PROJECT=nightjar-audio
RUNTIME_SA="$(gcloud functions describe finishPasskeySignIn \
  --gen2 --region=europe-west2 --project="$PROJECT" \
  --format='value(serviceConfig.serviceAccountEmail)')"
printf 'Nightjar passkey function runs as: %s\n' "$RUNTIME_SA"
test -n "$RUNTIME_SA" && [[ "$RUNTIME_SA" == *gserviceaccount.com ]] || {
  echo 'Could not identify deployed runtime service account; STOP and inspect the function.'
  exit 1
}
```

3. Confirm this is the expected function and its runtime identity. Enable the
   Google IAM APIs required by Admin SDK remote JWT signing.

```bash
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com \
  --project="$PROJECT"
```

4. Grant the runtime account **Service Account Token Creator ON THAT SAME
   SERVICE ACCOUNT**. This is a narrow resource-level binding, not a project-wide
   Owner or Token Creator grant. Only do so after you verify the printed email.

```bash
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT"
```

5. Wait a few minutes for IAM propagation; reopen the Nightjar installed PWA
   and test its saved passkey. The fix is permission-only and should not require
   redeploying the Cloud Functions or changing any member passkeys.
6. If it still fails, view **Cloud Logging** for `finishPasskeySignIn`, specifically
   `NIGHTJAR_PASSKEY_TOKEN_SIGNING_FAILED`, and check the redacted
   `iamPermissionSuspected` marker and error code. Do not share IDs,
   secret tokens or raw WebAuthn challenges.

### Security notes

- **Do not** download a service account JSON key, put private keys in GitHub,
  disable browser-origin validation, bypass WebAuthn or use client-side
  biometric success as proof of authentication.
- The runtime service account may be shared by other Firebase Functions.
  A dedicated least-privilege signing service account is preferable for
  long-term production hardening. Use the narrow resource-level binding
  above in the meantime, rather than giving a project-wide Token Creator role.
- Grant IAM roles only as an authorized project administrator. If Cloud Shell
  reports `PERMISSION_DENIED`, the project owner must perform the grant.

Official Firebase documentation:
https://firebase.google.com/docs/auth/admin/create-custom-tokens#service_account_does_not_have_required_permissions
