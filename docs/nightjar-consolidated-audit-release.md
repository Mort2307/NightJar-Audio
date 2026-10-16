# NightJar consolidated audit release — integration gate

**PR:** #206 · **Branch:** `integration/nightjar-full-audit-release`

## Verified in CI
The PR head `1874ab6029f490f463cdb72116fa3e3cc90d8eb2` passed all six reported GitHub Actions workflows, including frontend validation, backend release candidates, modular validation, build and PR preflight. A green build is not an end-to-end production readiness certification.

## Implemented in this branch
- Independently reviewed release-credit claims: member claim, uploader confirmation/dispute/unsure, independent admin approval/rejection/revocation, and audit entries.
- Transactional active-slot locks, stable contributor slot IDs, age-verified callable access and public profile credits sourced from approved claims only.
- Server-approved professional roles determine the official moon badge. A credited listener never gains creator publishing privileges from a credit.
- Member and admin credit queues, release/contributor selection, profile verified release lists, and responsive discovery/Spotlight navigation refinements.
- Callable-contract and non-deleting Cloud Functions deployment-scope compatibility.

## Outstanding release blockers
- Implement and test uploader-initiated contributor invitations and member acceptance/decline, or explicitly remove that requirement from the approved product scope.
- Provide claimant/uploader/admin notifications with deep links, and a correction/appeal path for rejected or revoked claims.
- Add paginated administrative and member queues so older unresolved claims cannot disappear behind the first 100 records.
- Verify credit Firestore rules deny unauthorised client writes; run emulator security and concurrency tests, plus role-based end-to-end tests.
- Complete visual and workflow acceptance for all 16 audit workstreams on mobile and desktop; CI contracts do not substitute for hands-on acceptance.
- Stage backend callable deployment safely before enabling frontend paths that invoke those callables. Do not trigger paid Didit checks or alter existing approvals.

## Release decision
**NOT YET APPROVED FOR PRODUCTION MERGE.** The green PR CI is necessary but not sufficient. Do not merge or deploy until the above blockers are resolved and retested. PR Hosting preview workflow has already run successfully; this is distinct from production deployment.
