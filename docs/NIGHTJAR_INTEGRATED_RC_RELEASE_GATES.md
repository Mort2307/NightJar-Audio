# NightJar integrated release candidate — release gates and acceptance record

**Candidate:** Six-source integration of draft PRs #293, #294, #296, #297, #298, #299. No separate draft was silently omitted.
**Reference base:** `fc27c3355b8e2ea9145dc74ecfefb88aba0242dc` (main at assembly).
**Protected paths:** No Firebase Functions, Firestore/Storage security rules, payments, provider configuration, Didit thresholds, role permissions or secrets changed.
**Scope:** Mid­night Gold / human-first design standards, operational readability, Inbox and message handling, reliable Home/Studio navigation, mobile role tabs, private calendar editing.
**Source preservation:** `NIGHTJAR_INTEGRATED_RC_MANIFEST.json` records original PR commits and file blob SHAs. All 29 source files must match byte-for-byte; `package.json` is the sole conflict and merges both validation commands.

## Step 1 — source integration

- [x] Compose exact source revisions from six open drafts against the same production base
- [x] Preserve both extra test runners when combining the two `package.json` edits
- [x] Record immutable PR and file provenance in the integration manifest
- [ ] Confirm review of final source diff and authors' pending comments

## Step 2 — complete automated and security regression

**CI gate**: typecheck, build, full `npm run validate`, modular validator, Functions compile/typecheck, isolated Firestore/credit emulator tests, Hosting preview action. Check *each run at the exact integrated commit*, not the green source PRs.

The integrated provenance script exercises the merged branch and must pass as part of regular `validate:contracts`. Existing security, Didit/age-verification, messaging, upload-idempotency, admin queue, calendar, role, scroll, accessibility and full-release-hardening source contracts are retained. **CI does not prove cross-account data isolation or correctness of interactions on actual devices**.

### Required real-account integration cases — status NOT RUN

| ID | Test account(s) and action | Required result |
| --- | --- | --- |
| I01 | Verified returning Listener signs out/in and reopens Profile/Calendar | Remains verified, saved profile is present and wizard does not reappear |
| I02 | Fresh unverified test account directly opens /calendar, /messages, /creator and protected deep links | Mandatory Didit gate prevents private content access; no bypass through preview |
| I03 | Creator A and Writer B: send/reply via Inbox, search messages, reopen after role switch | Recipient and thread remain correct; no stale draft posted to another recipient |
| I04 | Owner/Admin sends a private message to Creator A and reads their response | Admin Inbox works, unread and needs-reply counts match stored conversation |
| I05 | Send rapid successive messages / reopen during slow network | One send per action; no duplicates or lost unsent text |
| I06 | Two accounts open the same named script or writer page | Protected manuscript and collaboration content visible ONLY to authorised accounts |
| I07 | Submit same Writer draft once, rapid repeat attempt; inspect Admin queue | Exactly one submission record; queue count and notification not duplicated |
| I08 | Upload a Creator audio draft, navigate away, reopen and cancel/delete with staged confirmation | Recovered draft and safe delete; no unrelated published file removed |
| I09 | Owner views manuscript and Creator approvals, handles an existing test request | Pending queues and counts agree; approval state and audit history correct |
| I10 | Hide/collapse Home catalogue, tap Browse audio and Personalise | Intended section opens and viewport reaches it, never an unrelated route |
| I11 | Collapse Creator pipeline, insights and collaborations; use dashboard metrics | Each metric opens the correct workspace and preserves drafts |
| I12 | Writer opens rights panel from a draft | Review controls become visible; NO automatic manuscript submission |
| I13 | Listener, Creator, Writer, Editor, Artist and Admin account roles: You → Profile → Calendar → Protection | Consistent active mobile dock, stable role permissions and history/back actions |
| I14 | Inbox and Activity with 0, 1 and 12 unread; separate needs-reply count | 9+ visual badge only where needed; assistive tech reads exact counts |
| I15 | Add, edit, move-to-next-month, cancel, and remove a disposable private calendar date | No duplicate event IDs; all-day dates remain correct around DST |
| I16 | Calendar offline error, failed write, retried refresh | Never claims save on failure; existing data preserved and retry works |
| I17 | Use 320/390px Android, desktop narrow viewport, 200% zoom, keyboard | Midnight Gold still legible; focus, tap targets, modal scroll and input zoom correct |
| I18 | With reduced motion / Vision Access enabled, navigate Home, Studio, Inbox, calendar | Motion settings respected; no unexpected scroll loops or hidden controls |
| I19 | iOS PWA and Android installed/PWA reopen Inbox draft, Profile and calendar | Session and role persist appropriately; no duplicated save, app version updates |
| I20 | Fresh Live Firebase preview on two verified disposable accounts | Separate account records and private events are never shared or leaked |

### Security and operations

- [ ] Verify repo visibility: GitHub reported **public** at RC assembly despite intended private status. Repository owner must correct via Settings → General → Danger Zone → Change repository visibility (requires suitable GitHub rights); this connector cannot change visibility
- [ ] Treat earlier public commit history as public, review for exposed keys or personal data and rotate secrets *if found* (changing visibility does not erase old clones)
- [ ] No production secrets or real protected manuscripts entered into preview test accounts
- [ ] Didit return URL, verification reuse and existing verified sign-in confirmed on actual devices
- [ ] Backend and Hosting release inventory confirms no unapplied backend dependency and correct Firebase project
- [ ] No unresolved owner safety issues, audio loss, manuscript exposure or broken signup
- [ ] Test backup/recovery and review rollback steps against the current production deployment

## Step 3 — one integrated preview

- [ ] Confirm PR preview URL is created for *this integration commit*
- [ ] Complete I01–I20 (or explicitly record blocked/failed cases, owner approval and mitigations) using test accounts
- [ ] Test BOTH standalone previews and the integrated preview only if regression isolation is required
- [ ] Record dates, app/browser versions, devices and tester initials before accepting a case

## Step 4 — production release gate and rollback

**Production state: BLOCKED**, unless and until the following evidence exists:
1. All CI checks green on this exact integrated HEAD, no active merge conflicts or changed target base.
2. I01–I20 accepted by a real tester, especially Didit and two-account Inbox/privacy testing; any exceptions documented and approved.
3. Repo visibility/privacy issue reviewed by owner.
4. Explicit owner go-live approval for the fully integrated set after acceptance, with production build target and rollback identified.
5. Merge the integrated PR as a single reviewed change, not the six source PRs independently. Recheck merge SHA and production Firebase Hosting workflow status; do not equate a preview with live deployment.
6. Release smoke tests post-deploy: account gate, Creator/Writer/Owner Inbox, profile and calendar, Admin queues, publish/undo logic. If critical failure, redeploy previously verified Hosting revision and pause affected write flows until diagnosed.

No developer should mark a case passed from code inspection or CI. A verified browser preview provides an interactive build, not permission proof. A production deployment must not be done on this checklist's behalf while the above gates are open.

## Notes and provenance

The source PRs remain open and unchanged. The integration candidate is a separate review branch and is intended to replace them as a single production release after acceptance. There is **no additional application subscription fee, AI generation service, new backend function or migration** in this release. NightJar's exact external messaging and licensed-content boundaries remain unchanged.

Incident follow-up: In case of user-reported missing messages, use the existing protected Admin tools, never ask users to publish private scripts or identity documents in GitHub/issue comments.
