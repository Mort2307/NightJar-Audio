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
| [#38](https://github.com/Mort2307/NightJar-Audio/pull/38) | Refresh recovery, Owner People roles, account alerts | **Technically superseded by PR #40** | Source-integrated; imported refresh contracts, multi-role queuing, active-workspace status protection; staging/device acceptance remains mandatory |
| [#37](https://github.com/Mort2307/NightJar-Audio/pull/37) | Deep-link refresh and white-screen repair | **Technically superseded by PR #40** | Equivalent recovery source present; installed-PWA QA remains |
| [#36](https://github.com/Mort2307/NightJar-Audio/pull/36) | Legal Centre and guarded Didit beta pilot | **Separate release / conflict** | Reconcile Legal Centre; Do **not** promote age-provider sandbox configuration or chargeable live testing without explicit owner and compliance approval |
| [#35](https://github.com/Mort2307/NightJar-Audio/pull/35) | Owner Console, accurate intake, navigation and Editor Studio | **Technically superseded by PR #40** | Equivalent source present; device interaction QA remains |
| [#32](https://github.com/Mort2307/NightJar-Audio/pull/32) | Automatic approval emails | **Technically superseded by PR #40** | Audited event delivery and retry in candidate; live Gmail delivery test remains |
| [#29](https://github.com/Mort2307/NightJar-Audio/pull/29) | Didit integration draft and push fixes | **Draft — not release-ready** | Required patcher, secrets, signed webhook and live workflow safety validations are outstanding |
| [#28](https://github.com/Mort2307/NightJar-Audio/pull/28) | Earlier Didit integration draft | **Draft — overlap** | Compare to #29/#36 and do not combine competing webhook implementations blindly |
| [#14](https://github.com/Mort2307/NightJar-Audio/pull/14) | Production entitlements and mobile player | **Draft — not release-ready** | Review production subscription entitlements, adult gating and device player tests separately |
| [#9](https://github.com/Mort2307/NightJar-Audio/pull/9) | Older consolidated hardening | **Legacy review** | Confirm supersession of unique security changes, do not overwrite newer backend |
| [#8](https://github.com/Mort2307/NightJar-Audio/pull/8) | Earlier app intelligence | **Legacy review** | Compare for unique unshipped work or formally supersede |
| [#7](https://github.com/Mort2307/NightJar-Audio/pull/7) | Earlier feedback/telemetry improvements | **Legacy review** | Compare for unique unshipped work or formally supersede |

PR #39 is included by verified Git ancestry in draft PR #40. PRs #38, #37, #35 and #32 are documented as technically superseded after source review; **seven other PRs remain pending**. None of these pull requests was automatically merged or closed.

## Reconciliation progress — source review, 10 October 2026

- **PR #37 — technically superseded by the candidate:** independent recovery page and root HTML are byte-identical; service-worker code differs only in a comment. Candidate Vite routing preserves root URLs and adds exact Git source versioning. Browser and installed-PWA refresh acceptance is **still required**.
- **PR #35 — technically superseded by the candidate:** Editor Studio, Role Dashboard, navigation reset utility and scroll contract are byte-identical, with the candidate carrying newer role-application archives and navigation contracts. Real-device tap and scroll QA is **still required**.
- **PR #32 — technically superseded by the candidate:** the newer backend has an audited, idempotent approval email event trigger with failed-delivery retry, with source regression coverage. Gmail email delivery and legal prerequisites still require staging verification.
- **PR #38 — technically superseded in source:** Owner action alerts and pending-only multi-role queuing were incorporated into PR #40. The Owner role editor uses protected transactional updates, explicit professional terms consent and a separate account-status-preserving workspace selector. PR #38's deep-link startup recovery regression script was imported for ongoing checks. The owner has locally validated the source at commit `c1a721c`; newly imported checks and staging/device behaviours are still unverified.
- **PR #36 — under legal and provider review:** guarded Didit webhook/client, Legal Centre and backend controls are present, but UK legal review and a configured, signed, live adult-document verification remain unproved. No chargeable live session or beta bypass removal has been authorised.
- **PRs #29 and #28 — overlapping Didit drafts:** do not merge their competing provider implementations onto #40 without a security review; PR #29 also contains independent push-related changes needing comparison.
- **PR #14 — separate production entitlement/player candidate:** remains a draft and requires commercial authorization, 18+ gating, device playback and payment checks.
- **PRs #9, #8 and #7 — early hardening/telemetry branches:** distinct legacy histories; the reviewer has not signed off their unique functionality as obsolete.

Only PR #39 is included by ancestry. The three technically superseded PRs above are **not** merged, closed or deployed. Their source dispositions are recorded in `docs/release-pr-review.json`. Remaining records are intentionally pending.

## Additional source reconciliation — 10 October 2026

- **PR #38 source equivalent incorporated and documented:** a transactional `adminQueueProfessionalRoles` callable stages pending professions without granting rights, and Owner People keeps its separate full-set approved roles editor. Local protected queue and status-preservation contracts passed on `c1a721c`. Imported startup recovery regression and live staging/device acceptance remain release gates; PR #38 remains open until owner review and housekeeping.
- **PR #36 beta legal checks strengthened:** restored contract coverage for the public Legal Centre, individually readable versioned terms, closed beta, retained allowlisted tester access and administrator-only live Didit pilot. This protects the **existing** beta policy; it does not authorise live age-verification charges or certify UK legal compliance.
- **PR #29 remains pending:** source review identified distinct FCM/push recovery and approved-logo PWA icon functionality. PR #40 now selectively incorporates device-specific FCM registration status, explicit opt-in (no login-time token re-registration), explanatory 401 errors, and authenticated per-device revocation, with a new source regression contract. **The dynamic installed-app icon/manifest, admin branding workflow and push setup scripts have not been ported or validated.** Its alternate Didit patcher must not replace PR #40's guarded provider.
- **PRs #7–#9 are not confirmed superseded:** older `RecommendationFeedback.tsx`, `LiveReleaseCard.tsx`, `CreatorDirectory.tsx`, `FollowingList.tsx` and the original `appdeploy-local-shim.ts` are not present at those paths in the candidate. This may reflect legitimate consolidation/retirement, but exact feature parity remains unproved; do not silently mark these reviews complete.
- **PR #14 production entitlements** and **PRs #28/#29 alternate age providers** are still isolated. Release the guarded beta candidate only after explicit safety review; do not infer billing readiness or live Didit approval from successful source contracts.

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
