# NightJar consolidated audit release — integration gate

**PR:** #206 · **Branch:** `integration/nightjar-full-audit-release`

## CI status
At commit `65248a0`, all six previous GitHub Actions workflows passed. The current hardening commit must pass **fresh** CI, including the new Firestore/Authentication emulator security job. Passing source-level checks and emulators is **not** the same as real-account release acceptance.

## Implemented
- Contributor credit member claims, uploader invites and accept/decline, uploader confirm/dispute/unsure, independent administrator approve/reject/revoke, correction appeals and append-only audit events.
- Transactional per-slot claim locks, account-bound and age-verified callable access, no arbitrary claimant/uploader UID trust, validated published attribution.
- Member and admin paginated queues, plus secure direct-claim lookup so notification links work for historical cases beyond the first page.
- Notifications to claimant, uploader and independent administrators using the existing account notification + push path, with dedupe keys, private lock-screen defaults and role-scoped direct links. Push delivery is best effort; actions remain committed if delivery fails.
- Server-derived official creator moon; a credited listener never obtains professional publishing privileges.
- All-client-deny Firestore rules, composite indexes for claim queues and published-credit lookup.
- New CI emulator test for denial of client mutation/read and atomic slot contention, plus source contracts.
- Merge Hosting deploy plan: detect credit feature changes; deploy indexes and exact selected Cloud Functions through the existing protected backend workflow; block Hosting if any batch fails.

## Outstanding before production
1. **Manual authenticated acceptance:** complete all 16 workstreams with real test roles and mobile/desktop UX evidence; see `docs/nightjar-release-acceptance.md`.
2. **Didit:** confirm previously-approved live members retain access and unverified members cannot bypass ID verification (without creating unnecessary billable checks).
3. **Notification delivery:** real opt-in Android/browser push and deep links still require observed acceptance.
4. **Index safety:** before approving a production index deployment, compare `firestore.indexes.json` to existing live indexes and protect unmanaged indexes from deletion. Confirm the three new composite indexes are READY before enabling the queries.
5. **Release operations:** confirm required GitHub Actions permissions and deployed backend batches, no release while CI or emulator job is red.

## Release decision
**NOT YET APPROVED FOR PRODUCTION MERGE.** Keep draft; no live deployment and no provider sessions during CI.
