# Nightjar source-of-truth reconciliation — 13 October 2026

**Purpose:** Bring PR tracking, production source and operational release gates into alignment before building further features. This document is a source/release audit, **not** a claim that every feature is deployed or handset-verified.

## Canonical baseline

- Repository: `Mort2307/NightJar-Audio`; production branch `main`.
- Baseline audited: `4ccf034b3a5e4f83313b47953d71445c8881c351` (13 Oct 2026 13:09 UTC).
- PRs #39 and #40 **merged 10 Oct**. The previous `docs/release-pr-review.json` still nominated an already-merged branch as a live release candidate; that is historical, not an outstanding release.
- Firebase Hosting workflow passed for baseline [38402759506](https://github.com/Mort2307/NightJar-Audio/actions/runs/38402759506).
- [38376229553](https://github.com/Mort2307/NightJar-Audio/actions/runs/38376229553) deployed selected manuscript-review/licensing Functions on 13 Oct.
- [38401217793](https://github.com/Mort2307/NightJar-Audio/actions/runs/38401217793) deployed seven selected content/follower notification and preferences Functions. This is not an all-backend deploy.
- GitHub returned repository visibility `public` at audit time. Verify the intended visibility in repository settings; no access settings changed in this pass.

## Pull request disposition (branches preserved; no force merging)

| PR | Decision | Why |
| --- | --- | --- |
| [#128](https://github.com/Mort2307/NightJar-Audio/pull/128) | **Open / pending** | Writer submission CTA and old review UI require comparison with current `AdminManuscriptReview`; port only unique UX, never revert protected manuscript guardrails |
| [#73](https://github.com/Mort2307/NightJar-Audio/pull/73) | Closed, source superseded | Main has private professional application drafts, scroll and dismissal |
| [#71](https://github.com/Mort2307/NightJar-Audio/pull/71) | Closed, source superseded | Main has cloud profile drafts with conflict handling |
| [#67](https://github.com/Mort2307/NightJar-Audio/pull/67) | Closed, source superseded | Main has calendar UI, Firebase calendar API and scheduled release backend |
| [#38](https://github.com/Mort2307/NightJar-Audio/pull/38) | Closed, source superseded | Main has refreshed Owner roles, attention and navigation |
| [#36](https://github.com/Mort2307/NightJar-Audio/pull/36) | Closed, source superseded | Main has guarded Didit and beta legal hub; **not** live-provider signoff |
| [#35](https://github.com/Mort2307/NightJar-Audio/pull/35) | Closed, source superseded | Main has newer Owner Console, Editor Studio and routing |
| [#32](https://github.com/Mort2307/NightJar-Audio/pull/32) | Closed, source superseded | Main has event-based approval email delivery and admin retry |
| [#29](https://github.com/Mort2307/NightJar-Audio/pull/29) | Closed, source superseded | Main has newer Didit, branded install and push modules |
| [#28](https://github.com/Mort2307/NightJar-Audio/pull/28) | Closed, conflicting old implementation | Do not merge second Didit session/webhook model |
| [#14](https://github.com/Mort2307/NightJar-Audio/pull/14) | **Open / deferred** | Current entitlement helper exists; billing/old player changes require provider and device checks |
| [#9](https://github.com/Mort2307/NightJar-Audio/pull/9) | **Open / deferred** | Legacy recommendations/security features require Firebase-native parity review |
| [#8](https://github.com/Mort2307/NightJar-Audio/pull/8) | **Open / deferred** | Old intelligence/telemetry and local shim incompatible as-is |
| [#7](https://github.com/Mort2307/NightJar-Audio/pull/7) | **Open / deferred** | Earlier recommendations/discovery UI require targeted comparison |

**Important:** "Source superseded" means an older pull request has no safe reason to be merged wholesale into current `main`. It does **not** assert complete feature parity, mobile testing or selected Firebase Function deployment.

## Production alignment matrix

| Workflow | Current source | Backend | Acceptance work |
| --- | --- | --- | --- |
| Manuscript admin approvals and review conversation | Present | Selected review/licence functions deployed 13 Oct | Writer->Admin->publish end-to-end QA, protected source preview |
| Cloud role/profile drafts, finish later | Present | Callable declarations present; currently deployed revisions not verified in this audit | Android/iOS scroll, phone/PC resume, stale device conflicts |
| Calendar, scheduled audio, feedback | Present | Scheduler declaration present; current deployed revisions not verified | Never early-publish; validate timezone, scheduler and notices |
| Professional approval emails | Event trigger, retries and admin view present | Deployed trigger revision not verified | Test one email per newly approved role; failure/retry |
| Release/follower push and deep links | Present | **Seven selected functions successfully deployed** 13 Oct | On-device notification reception and scaling/cost QA |
| Premium player, EQ and lock-screen next | Present | EQ CORS live state and mobile behaviour not independently re-tested | Audible EQ, Chrome Android lock-screen next, transcript controls |
| Didit, legal, billing | Beta guarded source | Live provider, legal and processor sign-off unverified | **No public launch/checkout** until independent approval |

## Confirmed small inconsistency corrected in this reconciliation branch

The backend fallback for planning price is **699 pence**, but the Admin Finance Simulator started and reset to **£5**. The simulator now uses a shared **£6.99** default and a validation contract. Saved hypothetical scenarios remain user-controlled and are not silently overwritten. This does not change customer checkout or payment processing.

## Technical and operational gates

- Preserve `CLOSED_BETA`, temporary tester age bypass and admin-only billable Didit pilot until signed live 18+ checks, legal review and payment provider acceptance.
- Deploy backend functions in **explicit selected batches**; a green Hosting push never implies all Functions changed.
- Keep old PR branches until distinct features are either recovered or explicitly declined. No repository-history rewriting or deleting source dumps during the audit.
- Inspect the historical `NightJar-Audio-source-dump.txt` and `NightJar-fullpass.patch` for possible credentials and unique code before changing repo visibility/history; no secret exposure finding is asserted without inspection.
- Execute final SHA `npm run validate`, backend check/build, targeted release plan and real-device scenarios before operational completion.
- Consolidated owner-visible acceptance backlog: [#137](https://github.com/Mort2307/NightJar-Audio/issues/137). Cross-device detail: [#74](https://github.com/Mort2307/NightJar-Audio/issues/74).

## Follow-up order

1. Complete safe PR housekeeping and merge the small, validated inventory/finance corrections.
2. Verify exact deployed Function versions for the outstanding flows (no speculative deployment).
3. Conduct cross-device and protected-content end-to-end acceptance.
4. Only then review legacy recommendations, entitlement/payment integration, and new feature work.

**This pass changes no Firebase policy, accounts, paid entitlements, subscriptions, published media, or release rights.**
