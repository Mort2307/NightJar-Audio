# Nightjar — installation and release integration inventory

**Audited:** 10 October 2026. **Working reconciliation candidate:** `fix/nightjar-release-reconciliation-20261010` (draft PR #40, based on PR #39). **Production branch:** `main`. **No live deployment.**

## Evidence and non-negotiable status

- The original audit listed **12 open PRs**; reconciliation PR #40 was opened afterward. A GitHub branch being `mergeable` does **not** mean its features are merged, verified or deployed.
- PR #39 was originally audited at **78 commits ahead of `main`, zero behind**. The separate PR #40 reconciliation branch now includes #39 by Git ancestry, remains unmerged, and has passed the owner's Windows local validation (frontend and Functions) at commit `d7ebff2d1abd`. These changes are **not** available in live installed apps until a release is deployed.
- GitHub build and validation checks for PR #40 still report **failure before executing steps**, and job-log retrieval returns an unavailable blob. The exact runner failure remains unknown (see GitHub Actions UI annotations). The three workflow triggers were extended to this stacked PR's base branch; this enabled CI reporting but did not cure the runner failure.
- **No live Firebase deploy or device acceptance test was performed in this audit.** The local working tree cannot be inspected remotely.
- Source integrations include PR #37 recovery improvements, PR #38 owner notification/role protection, and a guarded PR #36 Didit/Legal Centre implementation; these have source-contract coverage but still require live integration, security and phone QA before release.

## Open PR reconciliation — every row requires an owner disposition

| PR | Workstream | Audit disposition | Action before an all-up installation |
| --- | --- | --- | --- |
| [#40](https://github.com/Mort2307/NightJar-Audio/pull/40) | Reconciliation candidate based on #39; backend security, guarded Didit, owner notifications, legal centre, regression tests | **Current draft candidate, NOT released** | Resolve outstanding PR review and GitHub Actions runner failures, complete staging/device QA before any production merge or deploy |
| [#39](https://github.com/Mort2307/NightJar-Audio/pull/39) | Full pass: profiles, multi-role, compression, touch UX, text integrity, PWA invitation, admin preview | **Included by verified Git ancestry in #40 (source only)** | Still not deployed; preserve in eventual reviewed integration |
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

PR #39 is included by verified Git ancestry in draft PR #40. The other eleven unresolved PRs remain pending; none has been silently marked approved for merging, discarding or deferral.

## Reconciliation progress — source review, 10 October 2026

- **PR #37 — technically superseded by the candidate:** independent recovery page and root HTML are byte-identical; service-worker code differs only in a comment. Candidate Vite routing preserves root URLs and adds exact Git source versioning. Browser and installed-PWA refresh acceptance is **still required**.
- **PR #35 — technically superseded by the candidate:** Editor Studio, Role Dashboard, navigation reset utility and scroll contract are byte-identical, with the candidate carrying newer role-application archives and navigation contracts. Real-device tap and scroll QA is **still required**.
- **PR #32 — technically superseded by the candidate:** the newer backend has an audited, idempotent approval email event trigger with failed-delivery retry, with source regression coverage. Gmail email delivery and legal prerequisites still require staging verification.
- **PR #38 — still under review:** owner approval alerts are integrated and now have a dedicated regression contract. Multi-role access uses the candidate's transactional full-set role editor. A **separate pre-approval queue action** from PR #38 has not been ported or declared unnecessary. This review also restored a missing feature: existing Listeners can now read and explicitly accept the current professional terms within My Roles before requesting additional professions; denial/outage fails closed without hiding existing roles.
- **PR #36 — under legal and provider review:** guarded Didit webhook/client, Legal Centre and backend controls are present, but UK legal review and a configured, signed, live adult-document verification remain unproved. No chargeable live session or beta bypass removal has been authorised.
- **PRs #29 and #28 — overlapping Didit drafts:** do not merge their competing provider implementations onto #40 without a security review; PR #29 also contains independent push-related changes needing comparison.
- **PR #14 — separate production entitlement/player candidate:** remains a draft and requires commercial authorization, 18+ gating, device playback and payment checks.
- **PRs #9, #8 and #7 — early hardening/telemetry branches:** distinct legacy histories; the reviewer has not signed off their unique functionality as obsolete.

Only PR #39 is included by ancestry. The three technically superseded PRs above are **not** merged, closed or deployed. Their source dispositions are recorded in `docs/release-pr-review.json`. Remaining records are intentionally pending.

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
