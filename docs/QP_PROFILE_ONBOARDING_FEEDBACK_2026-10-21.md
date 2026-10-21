# Tester report — repeated profile setup and top-right avatar navigation

Date: 21 October 2026. Reporter: QP (creator; user-reported, not reproduced on a live member account).

## Feedback
- Tapping the top-right profile picture led to full-page role selection and felt like a dead end.
- The introductory three-step profile modal sometimes reopened while navigating after profile details had already been filled in, reportedly up to five times.
- Audio uploads and rich release metadata were positively received; avoid changing them.

## Confirmed source-level causes
1. Top-right avatar was wired to the full-screen role picker, while **Profile** and **My Roles** already had separate routes. No obvious return navigation existed on the picker.
2. The account hydration effect depended on the active role and re-evaluated `setShowOnboarding` on every role change. A profile edited using **Save profile** could still have `onboardingComplete=false`, because only the dedicated three-step onboarding flow set that flag.

## Fix
- Avatar and floating account shortcut now open the profile editor directly; role management remains in **My Roles**.
- Existing members who somehow reach the role-selection screen get **Back to NightJar**.
- The automatic onboarding offer shows at most once per member per mounted app session; it does not reappear on a role switch, and a confirmed completion closes it.
- Deliberately saving the main profile now marks optional onboarding complete through the existing server transaction. Completed status is monotonic server-side and cached in this session to protect against slow older fetches.
- Members choosing **Save & finish later** keep their cross-device defer/draft behaviour.
- Do not touch creator audio upload, metadata, permission checks, Didit age assurance or identity approvals.

## Evidence / acceptance
- Added source regression contracts to the standard pipeline.
- CI build and preflight must pass before merge; deploy only via guarded production workflow.
- Still requires real-device member acceptance: new account, completed account, deferred account, profile switch, role switch, browser refresh/sign-out-in, failed offline save and narrow viewport.
- Feedback alone is not proof that QP's historical individual data is already reconciled; test with that account after release.
