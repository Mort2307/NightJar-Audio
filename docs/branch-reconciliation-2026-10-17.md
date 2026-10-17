# NightJar branch reconciliation — 17 October 2026

## Scope and verified production baseline

- Repository: `Mort2307/NightJar-Audio`
- Production baseline: `main` at `5bf4ce42dd282fc19b18064a069caad3e1f4afee`.
- Existing Firebase Hosting workflow, production source-version smoke test, two selected transcript backend deployments, and CI had **succeeded** for that commit before this audit.
- Audit run: https://github.com/Mort2307/NightJar-Audio/actions/runs/39068768510
- The run exported **full 210-branch JSON and Markdown inventory** as `nightjar-branch-reconciliation-39068768510` (GitHub Actions artifact, retained 14 days). The audit implementation and workflow remain reusable.

The audit is read-only. It did not deploy, merge, execute historical branch code, or delete any historical branches. Local uncommitted work cannot be seen from GitHub.

## Findings — Git ancestry and changed files

| Branch finding | Branches |
|---|---:|
| Head commit is an ancestor of `main` | 21 |
| No branch-touched file-content differences vs `main` | 8 |
| Divergent versions of existing code (requires context, not necessarily missing features) | 164 |
| Only documentation/assets/config differences | 3 |
| Branch-only code files absent from `main` | 14 |
| **Total audited** | **210** |
| Audit errors | **0** |

**IMPORTANT:** 181 entries with a file difference are **not** equivalent to 181 unmerged or missing deliverables. GitHub routinely creates divergent feature commits after squash merges, and `main` now contains subsequent, deliberately different fixes.

## Cross-reference against all 210 PR records

- **165 branch heads exactly match the head of a merged PR.** Even though some file hashes now differ, the historical branch tip was explicitly submitted and merged.
- **2 additional branches have a merged PR but were subsequently updated:** `feature/admin-live-profile-viewer-20261011` (three new directory/UI commits) and `feature/didit-meg-single-live-check-20261015` (32 follow-up pilot/consolidation commits).
- **35 branches map to closed, unmerged PRs**, many expressly labeled superseded or closed during the 17 October reconciliation.
- **8 branches have no associated PR in the retrieved history** (including two already proved to be ancestors of `main`). Several served as release/integration staging branches.

PR statuses and branch ancestry are overlapping forms of classification; do not add them together.

## Semantic triage of areas flagged by the inventory

| Historical material | Production comparison / safe disposition |
|---|---|
| One-off Didit integration workflows, pilot pages and dashboard from `didit-verification-integration`, `feat/didit-required-once-for-all-beta` and staging branches | Current protected Didit gate, status/reconciliation, admin control centre and staged production release system supersede these. **Do not reapply old pause/bypass logic.** |
| `ReleaseReadinessDashboard.tsx` on `feature/release-hardening-profile-polish` | Current `AdminReleaseReadiness.tsx` and `AdminQualityCentre.tsx` cover a more comprehensive operational release-readiness process. The old component is not evidence of a missing deployment. |
| Extra professional directory UI commits on `feature/admin-live-profile-viewer-20261011` | Current `ProfessionalLibrary.tsx` supports VA, Writer, Editor and Artist browsing and connected profiles. Its old PR was merged before the branch's three follow-up commits; no automatic merge is warranted. |
| Older `AdminMemberRoleManager.tsx`, writer marketplace CSS, transcript client tests | Current `ProfessionalRoleManager`, approved manuscript workflow and manual transcript sync have since been redesigned. Compare desired UX, not stale source-file names. |
| Old Cloud Run artwork cache PR | Deliberately superseded by #213, which reduces repeated public metadata requests without delaying image-moderation takedown. Old public-cache changes must remain unmerged. |
| `CreatorDirectory`, `WriterStudio`, `SecurityReviewPanel` in September AppDeploy drafts | Modern Firebase Professional Library, manuscript flows, owner safety and security alerts cover their primary workflows. Do not restore abandoned AppDeploy client/API integration. |
| `RecommendationFeedback.tsx` from September experiments | **Product-gap candidate:** old `More like this / Less like this / Not for me` controls post to retired `/api/taste/feedback`. No equivalent user-specific taste-feedback control was confirmed by this branch audit. Rebuild in Firebase **only if intentionally wanted**; old code cannot be deployed unchanged. |
| `ScriptAccessManager.tsx` from September experiments | **Product-gap candidate:** legacy granular read/copy/export grants and access requests use retired `@appdeploy/client`. Current protected preview and licensing features exist, but identical fine-grained granting semantics were **not proven**; require a privacy/security design and new Firebase rules before any revival. |
| `public/robots.txt` and old scripts/docs from September drafts | Infrastructure/policy/documentation leftovers, not production build failures. Verify desired crawler and policy behaviour separately before introducing legacy settings. |

## Final release-state conclusion

- The prior 10 open PRs were reconciled; the replacement fixes were successfully deployed, and the last pre-audit production deployment succeeded for commit `5bf4ce42...`.
- **No missing deployment of the current `main` build was found.**
- Historical branches are deliberately retained because **content differences alone cannot justify deletion** and some contain legitimate design concepts.
- The two potential legacy product gaps above are **not pending PRs, completed unmerged fixes, or failed deployments**. They are candidates for an explicit new roadmap decision.
- To claim absolutely that no development work exists outside GitHub would require inspecting local worktrees, stashes and connected build systems; this GitHub audit cannot do that.

## Safe housekeeping policy

1. Retain all historical branch refs until the owner separately authorizes archival/deletion, with recoverable tags or a tested backup.
2. Do not mass-merge historical branches; carry forward *specific desired behaviour* through clean, tested PRs against current `main`.
3. Run the reusable `NightJar historical branch reconciliation` workflow again after substantial releases, and attach the full audit artifact to release readiness.
4. Private GitHub runner registration, Android physical-device QA and live transcript testing remain external operational gates, not hidden pending PRs.
