# NightJar closed-beta Didit pause

## Temporary beta behaviour

- New Didit sessions are paused across the ordinary member flow, account self-service, administrator maintenance and single-member maintenance routes.
- Existing signed Didit webhook processing and already-approved account records are preserved.
- Existing genuine provider approvals remain distinguishable from beta admission.
- An active account whose verified Firebase email exactly matches an enabled server-side `closedBetaAllowlist` entry receives the complete NightJar closed-beta experience, including protected adult audio, manuscripts, creator workspaces and paid-tier features, without completing Didit during maintenance. This temporary admission is not recorded as age assurance or a paid subscription.
- Protected adult audio, audio transcripts, Editor audio samples, full manuscripts, protected manuscript samples and administrator previews accept either genuine live Didit approval or the temporary server-side closed-beta admission while the private beta flag is enabled. The temporary admission is a separate testing exception; it never changes genuine Didit status.
- Creator dashboards return full owner content, including transcript text. Creating or editing release audio/transcripts, submitting adult releases, listening to protected audio, and accessing manuscript content or review workflows are available to explicitly allowlisted closed-beta testers through the same temporary admission.
- The temporary path is account-bound, checks the current allowlist entry and account status, and does not write to `ageAssurance` or set `providerVerified`.
- Allowlisted testers receive a temporary free entitlement for the full paid-feature experience, including catalogue listening. The entitlement is not represented as a paid subscription and is removed when closed beta ends.
- Administrator permissions remain governed by the existing server-side administrator checks. The tester path does not grant admin capabilities.
- The temporary access path is bounded by both `TESTING_AGE_ASSURANCE_BYPASS` and `CLOSED_BETA`; turning off closed beta disables it automatically.

## Restore Didit

When the provider account/domain and verification flow are ready:

1. Reconcile any outstanding Didit sessions and preserve existing webhook evidence.
2. Re-test the standard and controlled verification flows in a non-production environment.
3. Set `TESTING_AGE_ASSURANCE_BYPASS` to `false` in `functions/src/index.ts`; verify the separate gifting module in `functions/src/nightjars.ts` remains `false`.
4. Set `DIDIT_VERIFICATION_PAUSED` to `false` in the backend and frontend, and set `DIDIT_ACCOUNT_SELF_SERVICE_ENABLED` to `true` only after the full flow passes.
5. Restore the frontend pause flag to `false`.
6. Run the complete contract, typecheck, build and backend test suites before any deployment.
7. Confirm the beta access cohort and the subscription launch policy separately.

This document describes a temporary internal testing configuration. It is not a claim that an invitation or personal familiarity is a formal age-verification result, nor a public-launch compliance approval.
