# QP follow-up — 100% complete profile with a stale setup banner
21 October 2026 · Reporter QP (manual tester)

## Confirmed from QP's follow-up
- Avatar account menu: My Profile and Switch Roles both navigate correctly.
- Previously saved profile fields remain intact.
- Switching between approved roles works smoothly.
- Signing out and in again succeeds without recurring automatic setup prompts.
- Residual: Profile page still showed **Finish profile setup** while completion metric was **100%**. Tapping it opened the old, apparently blank onboarding wizard. User did not request to reset anything.

## Cause found in source
The completion metric uses eight optional saved profile signals, while the banner and login invitation gate used only a distinct `onboardingComplete` flag. A pre-existing profile with all eight populated fields but no completed flag could therefore display contradictory status. The wizard also prioritised old `onboardingDraft` content over current published personal profile fields.

## Fix
- Centralise the exact eight profile signals and the setup-complete decision in `profile-setup-state.ts`.
- Treat a full **100%** legacy personal profile as already set up for both the sign-in prompt and the profile banner; completed explicit wizard status remains valid even if optional extras aren't filled out.
- Only show the banner after a real profile has loaded; hide it for a completed or full existing profile.
- When incomplete members resume a saved draft, preserve already published nonempty text and selections instead of overwriting them with stale empty draft fields. On truly incomplete accounts the draft and step-index resume remain available.
- This is a UI reconciliation, not an age-verification shortcut or an unsanctioned profile write. Never delete existing saved fields or change member roles.

## Acceptance
- Source regression tests run an actual transpiled TS helper for legacy full/incomplete/explicitly completed/deferred/empty/whitespace cases and assert banner, login and wizard integration.
- Production requires full CI and Firebase Hosting completion before inviting QP to retest.
- QP's own account still needs a visual check that the banner is gone and existing details remain saved after a refresh and role switch.
