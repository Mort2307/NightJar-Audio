# NightJar — 14-workstream engineering reconciliation

**Audit source:** `main` at `d214fb527f8cd0aeabbbb12e39c28cb3ca26079b` (5 November 2026).  
**Purpose:** map the fourteen NOT-RUN acceptance workstreams to the source-level regression contracts already in the repository, identify unproved runtime acceptance, and prevent those contracts from silently falling out of the main validation chain.

This is an engineering coverage map, **not** a claim that the fourteen journeys have passed. The existing acceptance matrix remains authoritative for human testing. Didit (#2) and Notifications (#15) are separately user-confirmed as working, but neither has its complete recorded acceptance matrix.

## Workstream map

| Acceptance row | Workstream | Existing source-level regression coverage | What this does not prove |
|---:|---|---|---|
| 1 | Sign-in & recovery | `auth-entry-ux-contracts`, `passkey-security-contracts`, `nested-route-recovery-contracts`, `refresh-route-contracts` | Real account registration, passkey/biometric enrolment, recovery email delivery, session expiry and logout across devices |
| 3 | Legal & consent | `legal-didit-beta-contracts`, `creator-copyright-terms-contracts` | A real member completing each current legal/consent path and seeing the correct versioned receipt |
| 4 | Listener Home | `spotlight-profile-layout-contracts`, `audit-discovery-navigation-contracts`, `home-script-scroll-contracts` | Real listener navigation and visual/touch behaviour on supported handsets |
| 5 | Discovery/search | `audit-discovery-navigation-contracts`, `professional-profile-share-contracts`, `profile-connections-contracts`, `directory-official-moon-contracts` | Search quality against real approved directory data, manual-ID fallback and every destination/deep-link on installed PWA |
| 6 | Audio playback | `listening-experience-contracts`, `unified-premium-player-contracts`, `player-media-session-eq-contracts`, `optional-release-transcript-backend-contracts`, `transcript-sync-contracts` | Actual audio on Android/iOS/desktop, lock-screen and Bluetooth controls, seeking/resume, entitlement boundaries and transcript usability |
| 7 | Public profiles | `directory-official-moon-contracts`, `admin-community-profile-contracts`, `profile-connections-contracts`, `professional-profile-share-contracts` | Two-account public/private/unlisted visibility, role tabs, follow counts and approved-role presentation on real accounts |
| 8 | VA Creator Studio | `audio-upload-contracts`, `creator-release-autosave-contracts`, `studio-upload-recovery-contracts`, `media-finalize-concurrency-contracts` | Actual large-file upload, interruption/retry, moderation, scheduling, publishing and cross-device draft recovery |
| 9 | Writer Studio | `manuscript-approval-workflow-contracts`, `writer-marketplace-moderation-contracts`, `admin-writer-review-message-contracts`, `writer-upload-idempotency-contracts` | Writer/Admin two-account rights boundaries, protected manuscript access, real review/reply and marketplace licensing journey |
| 10 | Editor Studio | `audio-upload-contracts`, `editor-moderation-atomic-contracts`, `professional-profile-share-contracts`, `approved-work-framing-contracts` | Real portfolio upload/preview, moderation decisions, collaboration acceptance and role-specific privacy |
| 11 | Artist Studio | `admin-community-profile-contracts`, `approved-work-framing-contracts`, `profile-connections-contracts`, `professional-profile-share-contracts` | Real gallery upload, licensing/commission journey, moderation and public profile appearance; this role needs focused handset acceptance |
| 12 | Community & messaging | `community-contracts`, `nightjar-team-community-contracts`, `admin-writer-review-message-contracts`, `notification-create-dedupe-contracts` | Real member-to-member permissions, report/owner handling, conversation delivery, unread state and mobile IME/keyboard behaviour |
| 13 | Credited member flows | `verified-credit-release-contracts`, `credit-workspace-ux-contracts`, `verified-credit-index-guard-tests` | Real claimant/uploader accounts, invitation continuation, conflict/appeal outcomes and protected claim retrieval |
| 14 | Admin credit moderation | `verified-credit-release-contracts`, `credit-workspace-ux-contracts`, `verified-credit-index-guard-tests`, `admin-server-pagination-contracts` | Independent real reviewers, approve/reject/revoke/appeal, audit evidence and production queue pagination |
| 16 | Responsive/accessibility | `accessibility-contracts`, `vision-access-contracts`, `mobile-touch-layout-contracts`, `app-wide-human-first-contracts` | Computed browser layouts at 320/390/768px and desktop, 200% browser zoom, actual screenreader/keyboard operation and reduced-motion review on devices |

## Cross-cutting observations

1. The repository already contains meaningful, feature-specific source contracts. The fourteen workstreams are not fourteen missing modules; much of the implementation is already present.
2. The most significant gap is **runtime evidence**: the existing tests inspect source contracts and selected backend/emulator behaviour, but do not replace two-account production-permission tests or actual handset acceptance.
3. The Artist and Editor workstreams have useful shared professional-profile/media contracts, but need focused role-by-role acceptance rather than inheriting a generic “professional” PASS.
4. Messaging and notification contracts cover deduplication and selected routing/permissions. They do not prove real opted-in FCM delivery or every mobile keyboard/IME combination.
5. Credit callable contracts and isolated emulator tests do not prove all deployed Functions are running the patched dependency tree. Keep the separate dependency rollout gate in issue #318.
6. Repository privacy is a release blocker: authenticated GitHub metadata still reports this repository as **public**. See issue #292. This workflow cannot change repository visibility.

## Validation guard added in this pass

`scripts/nightjar-14-workstream-coverage-contracts.mjs` maps every acceptance row to existing source-contract files and verifies those files remain reachable from `npm run validate`. This is a maintenance guard only; it deliberately does not change a human/device acceptance status.

The acceptance matrix in `docs/nightjar-release-acceptance.md` remains unchanged. Keep every workstream NOT RUN until an approved tester records date, role, platform and PASS/FAIL/BLOCKED without PII or tokens.

## Current release boundary

- Main inspected: `d214fb527f8cd0aeabbbb12e39c28cb3ca26079b`.
- The connected GitHub status and workflow-run queries returned no records for this exact SHA; this is **unverified**, not a CI failure and not a CI pass.
- Draft PR #336 (Profile Types, Commitment Tracking & Compensation Centre) and PR #331 (Didit resubmission review) remain separate open work.
- No merge, Firebase deployment, paid Didit session, production data mutation or payment was performed by this reconciliation.
- Keep release **NO-GO** until current CI, the separate security/deployment gates and all required human acceptance are evidenced.
