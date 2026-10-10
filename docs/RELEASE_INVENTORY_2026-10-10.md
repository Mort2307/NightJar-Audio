# Nightjar — installation and release integration inventory

**Audited:** 10 October 2026. **Working candidate:** `feature/self-service-professional-roles-20261010` (PR #39). **Production branch:** `main`.

## Evidence and non-negotiable status

- GitHub currently shows **12 open PRs**. A GitHub branch being `mergeable` does **not** mean its features are merged, verified or deployed.
- At audit time the candidate was **78 commits ahead of `main`, zero behind**. It remains unmerged. Pull request changes are not available to live installed apps by virtue of an app installation alone.
- GitHub build, validation and modular-validation runs for the candidate were **red**, with jobs reporting no steps and job-log retrieval returning an unavailable blob. The precise runner failure has **not been established**; do not describe these checks as passed.
- **No live Firebase deploy or device acceptance test was performed in this audit.** The local working tree cannot be inspected remotely.
- A key item from PR #37 **has been ported into the candidate**: absolute Vite assets, rooted HTML bootstrap, independent `/recover.html`, service worker v12 and automatic scrolling. These must pass integration, build and phone QA before release.

## Open PR reconciliation — every row requires an owner disposition

| PR | Workstream | Audit disposition | Action before an all-up installation |
| --- | --- | --- | --- |
| [#39](https://github.com/Mort2307/NightJar-Audio/pull/39) | Current full pass: profiles, multi-role, photo compression, touch UX, text integrity, PWA invitation, live admin preview | **Candidate, NOT released** | Run full checks, integration QA, review and merge into `main` |
| [#38](https://github.com/Mort2307/NightJar-Audio/pull/38) | Refresh recovery, owner People roles, account alerts | **Reconcile** | Review 22 commits not in #39 history; incorporate missing owner/admin security flows with privilege tests, or explicitly supersede after code review |
| [#37](https://github.com/Mort2307/NightJar-Audio/pull/37) | Deep-link refresh and white-screen repair | **Partially integrated** | Verify equivalent recovery functionality in #39, confirm mobile and installed-PWA QA, then close/supersede appropriately |
| [#36](https://github.com/Mort2307/NightJar-Audio/pull/36) | Legal Centre and guarded Didit beta pilot | **Separate release / conflict** | Reconcile Legal Centre; Do **not** promote age-provider sandbox configuration or chargeable live testing without explicit owner and compliance approval |
| [#35](https://github.com/Mort2307/NightJar-Audio/pull/35) | Owner Console, accurate intake, navigation and Editor Studio | **Reconcile** | Compare unique work and contract tests, particularly administrative navigation and approval archive |
| [#32](https://github.com/Mort2307/NightJar-Audio/pull/32) | Automatic approval emails | **Reconcile** | Confirm Gmail OAuth sender, idempotent notice record, delivery status/retry and approved-role security checks |
| [#29](https://github.com/Mort2307/NightJar-Audio/pull/29) | Didit integration draft and push fixes | **Draft — not release-ready** | Required patcher, secrets, signed webhook and live workflow safety validations are outstanding |
| [#28](https://github.com/Mort2307/NightJar-Audio/pull/28) | Earlier Didit integration draft | **Draft — overlap** | Compare to #29/#36 and do not combine competing webhook implementations blindly |
| [#14](https://github.com/Mort2307/NightJar-Audio/pull/14) | Production entitlements and mobile player | **Draft — not release-ready** | Review production subscription entitlements, adult gating and device player tests separately |
| [#9](https://github.com/Mort2307/NightJar-Audio/pull/9) | Older consolidated hardening | **Legacy review** | Confirm supersession of unique security changes, do not overwrite newer backend |
| [#8](https://github.com/Mort2307/NightJar-Audio/pull/8) | Earlier app intelligence | **Legacy review** | Compare for unique unshipped work or formally supersede |
| [#7](https://github.com/Mort2307/NightJar-Audio/pull/7) | Earlier feedback/telemetry improvements | **Legacy review** | Compare for unique unshipped work or formally supersede |

None of the unresolved rows has been silently marked approved for merging, discarding or deferral.

## Release gates

1. **Branch scope:** `main` is the production source. Confirm the candidate contains all owner-approved work; review outstanding PRs one by one. Preserve data and avoid automatic conflict resolution of overlapping Firebase Functions.
2. **Encoding and typing:** Verify no source mojibake, repair of existing display metadata, multi-word Genres/Tropes typing, unicode symbols and saving without data loss.
3. **Accounts:** Listener → professional application → separate admin approval → merged member profile → role switching; verify only approved roles can be activated, pending-count correctness and idempotent approval emails.
4. **PWA:** Fresh installation and update of an existing Nightjar standalone app. Test `/admin/approvals`, `/profile/roles` direct refresh, `/recover.html` after simulated stale cache, update prompts, notification clicks, no hidden bottom actions and no duplicate installation invitation.
5. **Backend:** `npm ci`, `npm run validate`, `npm audit`, `npm --prefix functions ci`, `npm --prefix functions run check`, `npm --prefix functions run build`, `npm --prefix functions run audit:guard`, `git diff --check`.
6. **CI:** GitHub build, validation and modular validation all green for the exact release commit, not a prior SHA; blocked until runner failures are resolved.
7. **Preview first:** Deploy Firebase Hosting to a preview channel, test actual accounts and Chrome/Samsung Internet-installed PWA in portrait and landscape.
8. **Live release:** Merge approved commit to `main`; deploy backend Functions/rules only when changed and verified, then Hosting. Do not redeploy an unrelated branch or claim release from an isolated feature branch.
9. **After release:** Confirm `/version.json` matches the deployed build; check cached app update on Android; verify routes, branding, age restrictions, subscriptions locked as appropriate, public profile images, approval email and alert workflows.
10. **Close the loop:** Record which PRs were merged, superseded or intentionally deferred, with reason and approval. Do not confuse `npm ci` (dependency installation) with actual end-user PWA release.

## What this inventory cannot determine remotely

- Uncommitted source changes in the user's local `C:\Users\Mikeo\Documents\NightJar-Audio` checkout.
- Whether Firebase Hosting and Cloud Functions currently contain the exact GitHub `main` revision.
- Real browser install eligibility or installed-app cache behaviour on each user's device.
- Whether intended changes exist outside this GitHub repository (e.g. provider console configuration, Firebase secrets).

Treat these as explicit acceptance checks, not assumed passes.
