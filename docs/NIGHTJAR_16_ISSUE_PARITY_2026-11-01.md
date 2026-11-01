# NightJar — 16-issue production parity ledger

**Reconciled:** 1 November 2026. **Source baseline:** `main b197d4b5be0eb7a2818e1ba67e9e4bb1bba0f226`. **Production proof:** [Hosting run 41292762947](https://github.com/Mort2307/NightJar-Audio/actions/runs/41292762947), build and validation successful.

This ledger distinguishes **code delivered**, **tested on live hardware**, and **ready for public launch**. The owner has authorised validated changes to go to *live closed beta* for feedback; this **does not** itself certify safety, permissions, legal, billing or real-device tests. Never manufacture a PASS, start paid identity checks for QA or delete protected creator records.

## Current issue disposition

| Issue | Verified engineering position | What still actually needs doing | Classification |
| --- | --- | --- | --- |
| [#137](https://github.com/Mort2307/NightJar-Audio/issues/137) | Existing Firebase/Hosting architecture and guarded deployment are running; latest live source is verified | Cross-role/device sign-off, UK legal and adult-content processor review; reconcile production records and permissions | **Open — launch readiness** |
| [#144](https://github.com/Mort2307/NightJar-Audio/issues/144) | Old legacy branches are deliberately not merged into current Firebase app; modern equivalents exist for several features | Evaluate truly absent recommendation/discovery/commerce behaviour only after privacy, costs and approved processor | **Open — intentionally deferred** |
| [#147](https://github.com/Mort2307/NightJar-Audio/issues/147) | Moment Marks quota protection and five-role experiences have shipped; #216 backend and Hosting verified | Test bookmark replay, boundary filtering, Voice Calling Card and production timeline with distinct devices/accounts | **Open — device acceptance** |
| [#219](https://github.com/Mort2307/NightJar-Audio/issues/219) | Finalise recovery, Writer CAS, atomic review and safe upload retry improvements deployed via #218/#220/#221/#223/#224 | Partially transferred byte resume, cross-role autosave parity and real two-device/offline/recovery tests not complete | **Open — engineering + QA** |
| [#242](https://github.com/Mort2307/NightJar-Audio/issues/242) | Spotlight and owner-controlled framing shipped (#241/#270); selected backend and Hosting verified | Real tall/wide/mobile/tablet artwork checks, focus/keyboard/crop preview; do not crop moderated originals | **Open — device acceptance** |
| [#252](https://github.com/Mort2307/NightJar-Audio/issues/252) | Transaction-first private audio retirement with idempotent cleanup shipped (#253); targeted backend and Hosting verified | Emulator failure/concurrency evidence and Android/desktop physical deletion receipt, access revocation tests | **Open — safety acceptance** |
| [#274](https://github.com/Mort2307/NightJar-Audio/issues/274) | Human-reviewed transcript file import (.txt/.md/.srt/.vtt) shipped (#278) | Automatic local/private speech recognition is **not implemented** and requires explicit opt-in, privacy and cost approval; test existing import | **Open — distinct product decision** |
| [#275](https://github.com/Mort2307/NightJar-Audio/issues/275) | Audio-first Studio Notes shipped (#282) with parent protection and targeted backend | Run 12 cases in `docs/STUDIO_NOTES_ACCEPTANCE.md`, including listener entitlements and parent takedown | **Open — device acceptance** |
| [#286](https://github.com/Mort2307/NightJar-Audio/issues/286) | Writer repeat-submit/idempotency protection deployed (#287) | Audit genuine legacy duplicate records against approval history; single **disposable** new Writer sample and retry test; never bulk delete | **Open — data review + QA** |
| [#290](https://github.com/Mort2307/NightJar-Audio/issues/290) | Admin Inbox, notifications, two-stage delete and Writer queue visibility released (#291) | Verify original pending manuscripts; Admin reply, Cancel vs Confirm, stale notifications on actual Android test | **Open — device acceptance** |
| [#292](https://github.com/Mort2307/NightJar-Audio/issues/292) | GitHub repository metadata on 1 Nov reports `visibility: public`, `private: false`; source-history exposure unreviewed | Owner-controlled repository visibility and full secret-history review, rotate anything exposed; verify deployments remain functional | **Open — owner/security blocker** |
| [#295](https://github.com/Mort2307/NightJar-Audio/issues/295) | Human-first UI batches #293–#299 were incorporated through consolidated PR #300, and common interface styles exist | This parity pass improves real operational typography/touch targets. Capture actual 320/390px, zoom, reduced motion, keyboard and cross-role usability results | **Open — UI parity + device acceptance** |
| [#301](https://github.com/Mort2307/NightJar-Audio/issues/301) | Historical RC #300 was **merged**, its production successor deployed. Old PR preview link expired 30 October | Preserve unrecorded manual security/UX acceptance in #310 and #137. No reason to re-deploy or re-open expired preview | **Open — historical QA transfer** |
| [#306](https://github.com/Mort2307/NightJar-Audio/issues/306) | Calendar backend (#304) and frontend (#303) shipped with verified production runs | All/Following permissions, teaser moderation, DST and account/device acceptance | **Open — device acceptance** |
| [#310](https://github.com/Mort2307/NightJar-Audio/issues/310) | Verified-credit backend, clients and indexes incorporated on main; more recent frontend and emulator PR checks have passed | Run authenticated 16-workstream matrix and real push/deep-link checks; read-only deployed-index inventory not confirmed | **Open — release acceptance** |
| [#318](https://github.com/Mort2307/NightJar-Audio/issues/318) | Six moderate legacy Cloud Functions transitive dependency advisories remain. #317 separated unchanged backend audit from Hosting-only builds without ignoring findings | Supportable patched Google/Firebase dependency update + reproducible lockfile + strict npm audit/emulator acceptance; scheduled audit remains active | **Open — security remediation** |

**Counts (not completion percentages):** 16 reviewed; 0 assumed fully accepted without evidence; 2 security/owner blockers (#292, #318); 2 deliberate feature/product decisions (#144, #274); all other items are a mixture of existing delivered code, real-device tests and limited known enhancements. Keep statuses explicit even when production deployment is green.

## Shared user experience bar — apply to every role

- Midnight Gold art direction, content-led layouts, readable copy, one obvious primary action and unobtrusive secondary routes. No generic SaaS overhaul or AI-generated persona.
- Core controls at least 44 px high, keyboard-visible focus, useful 200% zoom and 320/390 px mobile layouts. Vision Access and OS reduced-motion preferences win over stylistic animation.
- Server-truthful **loading**, **empty**, **error/retry** and **saved/completed** feedback; no fake success, record duplication or silent data loss.
- Same navigation semantics on Listener, Writer, Creator, Editor, Artist, credited and Admin views; maintain role-bound menus/permissions.
- Transcript, preview, artwork, upload, deletion, privacy and approval actions retain their own rights, consent, moderation and backend guards.
- Distinguish staging/PR preview, deployed site, authenticated real-device acceptance, and public-launch readiness.

## Highest-value acceptance matrix for live beta users

| Scenario | Roles/devices | Required evidence | State |
| --- | --- | --- | --- |
| A1 | Verified Listener Android PWA + desktop | Didit persists on return; unverified account blocked; no extra paid check | **NOT RUN this pass** |
| A2 | Creator ↔ Writer on two accounts | Correct Inbox recipients, unread counts, owned manuscript and reply access | **NOT RUN this pass** |
| A3 | Creator + Admin | One draft per double tap; upload recovery, review and scheduled release; no false success | **NOT RUN this pass** |
| A4 | Writer + Admin | Disposable manuscript, one submission, review reason, protected rights, legacy duplicates identified not deleted | **NOT RUN this pass** |
| A5 | Editor/Artist/Creator | Safe media removal and framing; cross-account denial, no dangling protected references | **NOT RUN this pass** |
| A6 | Verified subscribed + unsubscribed Listener | Studio Notes and transcript entitlements, parent takedown, protected player | **NOT RUN this pass** |
| A7 | Listener/Creator + Admin | Community calendar Following/All, teasers, DST, future-only moderated releases | **NOT RUN this pass** |
| A8 | Owner + claimant + uploader | Credited accounts/appeals and independently authorised decisions; no privileges inherited | **NOT RUN this pass** |
| A9 | All roles on Android/desktop/iOS where available | Readable 320/390px, 200% zoom, reduced motion, screen-reader, one primary action, no blocked buttons | **NOT RUN this pass** |
| A10 | Consent-driven opted-in phone | Real push + deep links go only to correct private destinations | **NOT RUN this pass** |

Use disposable, rights-cleared test records; never upload sensitive proof to GitHub. Report FAIL with build SHA, device, role, route, expected vs actual, and anonymised screenshot. Retest only the affected flow after a small fix. No scheduled paid checks.

## Release operations

1. Write a focused change on current `main` (never merge old abandoned branches wholesale).
2. Run full frontend contracts/build, source provenance, and isolated emulator checks where affected.
3. Backend/media/rights changes: strict Functions dependency audit and backend-first targeted deploy; never invent a security waiver.
4. Hosting-only UI: validate and deploy promptly without hiding unrelated dependency advisories. Verify `/version.json` source commit.
5. Keep one ledger: **source merged / backend live / Hosting live / live-device acceptance / optional public launch**.
6. Owner's live beta can give feedback after deploy. Public billing/legal launch needs independent explicit approval.

**This ledger is reconciliation and a beta acceptance plan, not a claim that each case was manually tested or that all issues can be safely closed.**
