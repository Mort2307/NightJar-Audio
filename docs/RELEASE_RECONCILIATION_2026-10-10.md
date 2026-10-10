# Nightjar — release reconciliation (10 October 2026)

**Source:** branch `fix/nightjar-release-reconciliation-20261010` based on PR #39. **Not merged or deployed.**

## Implemented in this branch

- Multi-role approval and admin profile grants require current professional-terms acceptance and server-verifiable age access. Suspended accounts cannot receive grants, and approvals never automatically reactivate accounts.
- Application approval persists the application, account update, and decision event atomically in one Firestore transaction.
- Owner notifications are driven by actual professional, image, release and review queues; they clear when work is finished and cannot be marked read as if reviewed. Only admins receive them.
- Dedicated public `/legal` reading hub links to the **existing versioned private-beta** legal documents, not unfinished commercial drafts.
- Consolidates the reviewed Didit module from PR #36, routes signed callbacks before the SPA rewrite, isolates signed **live** 18+ verification from sandbox/admin-test records, keeps explicitly allowlisted closed-beta tester access, and restricts provider session starts to administrators during the beta pilot.
- Adds an explicit confirmation and cost warning before an administrator requests a live Didit session; configuration alone does not start sessions.
- Prevents direct client Storage deletion of released audio masters; retain a backend-mediated lawful withdrawal/removal route.
- Adds static contracts for Didit and protected role approvals. Existing source-level tests are not substitutes for emulator and handset acceptance tests.

## Reconciliation to complete before release

1. Verify the current Firebase Hosting `version.json` and deployed Functions independently. **Do not assume this GitHub branch is deployed.**
2. Verify Didit Secret Manager wiring, callback URL, signed live workflow (18+), replay protection and duplicate webhooks in a staging project. Provision four Didit secrets only through controlled tools; never commit credentials. Use `npm run setup:didit:sandbox` for an independent staging project. The optional `setup:didit:live` wizard writes production secrets if explicitly run; do not run it casually.
3. Run Firebase Emulator tests as suspended, pending, approved, admin, invalid consent, underage, sandbox and stale-session accounts. Make sure the chosen provider can actually complete and revoke an account-bound verification.
4. Test one multi-role user from Listener through Writer + VA request, isolated approval, workspace switching, private portfolio persistence and re-login.
5. Run a preview build and test Android standalone PWA refresh, `/admin/approvals`, `/profile/roles`, `/legal`, push registration and `/recover.html`.
6. Confirm GitHub Actions failure root cause: PR #39 jobs ended with zero steps; the available job logs returned no blob. CI must be green for the final SHA, not a prior commit.
7. Reconcile the remaining open PRs individually; do not combine competing multi-role APIs, payment entitlements or age providers automatically.
8. Obtain legal and operational sign-off before public adult-content access, production checkout and lifting temporary beta bypass.

## Non-destructive local validation

```powershell
cd "C:\Users\Mikeo\Documents\NightJar-Audio"
git fetch origin --prune
git switch fix/nightjar-release-reconciliation-20261010
git pull --ff-only origin fix/nightjar-release-reconciliation-20261010
npm ci
npm run validate
npm --prefix functions ci
npm --prefix functions run check
npm --prefix functions run build
npm --prefix functions run audit:guard
npm run validate:reconciliation
git diff --check
```

The strict `npm run release:preflight` intentionally remains blocked by unresolved PR decisions and red GitHub Actions. Do not bypass that block.

## Important deployment warning

The previous `firebase deploy` hit Cloud Functions update mutation quotas while updating many functions simultaneously, although Firebase eventually reported completion. The next **approved** release should separate Functions from Hosting, deploy changed Functions in controlled batches and verify backend/Hosting revision alignment. Never deploy all Functions/rules from a potentially outdated branch or run an unreviewed bulk deploy to test code.

**Status:** committed to GitHub branch; requires local compilation, emulator validation, provider staging, owner review, GitHub CI repair, and preview/device QA. Production Firebase has not been modified by this branch.
