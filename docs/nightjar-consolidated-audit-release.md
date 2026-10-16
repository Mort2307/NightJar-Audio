# NightJar consolidated audit release — integration checklist

**Integration branch:** `integration/nightjar-full-audit-release`

## Included in the branch
- Verified credit domain states, role mappings and approval guardrails (foundation only).
- Official moon in Professional Library derives from server-approved professional roles.
- Directory moon regression contract script.
- Verified-credit security and deployment gate specification.

## Required implementation before this PR can be considered merge-ready
- Server-only, transaction-safe credit claim creation, uploader confirmation, independent corroboration and admin decisions; immutable audit trail.
- Release contributor slot IDs, duplicate-claim handling, verified-credit index and private evidence storage.
- Claim/invitation notifications, deep links, administrator moderation queue, correction/appeal/revocation.
- Credited listener account read model, multi-profession profiles, verified release links and discovery. Never grant professional permissions from a credit.
- Compact responsive Midnight Gold design token consolidation; fixed first Spotlight, meaningful listening action near top; preserve user home customisation.
- Direct search and discovery navigation, professional directory compact actions and role workspace density reductions.
- Player continuity, transcript/queue/credits access, tappable followers/following, profile routes.
- Accessibility and mobile/desktop layout validation, regression tests, Firestore security rules tests and CI.

## Deployment blockers
- None of the above feature work is implemented by this checklist.
- Typecheck, build, contracts and end-to-end tests have not been executed in this tool session.
- Didit live approvals and paid checks must remain untouched.
- Do not merge or deploy until the complete implementation and CI verification are finished.

## Suggested checks
`node scripts/directory-official-moon-contracts.mjs`
`npm run typecheck`
`npm run build`
`npm run validate`

The intent is a single final merge and deployment, not a claim that these steps are already complete.
