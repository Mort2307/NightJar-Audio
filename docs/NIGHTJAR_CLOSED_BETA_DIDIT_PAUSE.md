# NightJar closed-beta Didit pause

## Temporary beta behaviour

- New Didit sessions are paused across the ordinary member flow, account self-service, administrator maintenance and single-member maintenance routes.
- Existing signed Didit webhook processing and already-approved account records are preserved.
- Existing genuine provider approvals remain distinguishable from beta admission.
- An active, email-verified account on the server-side `closedBetaAllowlist` receives temporary closed-beta access to the full non-administrator product, including creator workspaces, manuscripts and audio playback.
- The temporary path is account-bound, checks the current allowlist entry and account status, and does not write to `ageAssurance` or set `providerVerified`.
- Beta listening access is free during this closed-beta period and is not represented as a paid subscription.
- Administrator permissions remain governed by the existing server-side administrator checks. The tester path does not grant admin capabilities.
- The temporary access path is bounded by both `TESTING_AGE_ASSURANCE_BYPASS` and `CLOSED_BETA`; turning off closed beta disables it automatically.

## Restore Didit

When the provider account/domain and verification flow are ready:

1. Reconcile any outstanding Didit sessions and preserve existing webhook evidence.
2. Re-test the standard and controlled verification flows in a non-production environment.
3. Set `TESTING_AGE_ASSURANCE_BYPASS` to `false` in both `functions/src/index.ts` and `functions/src/nightjars.ts`.
4. Set `DIDIT_VERIFICATION_PAUSED` to `false` in the backend and frontend, and re-enable account self-service only after the full flow passes.
5. Restore the frontend pause flag to `false`.
6. Run the complete contract, typecheck, build and backend test suites before any deployment.
7. Confirm the beta access cohort and the subscription launch policy separately.

This document describes a temporary internal testing configuration. It is not a claim that an invitation or personal familiarity is a formal age-verification result, nor a public-launch compliance approval.
