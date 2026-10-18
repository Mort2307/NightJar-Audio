# NightJar full-app hardening acceptance — 18 October 2026

This checklist complements [release acceptance](nightjar-release-acceptance.md) and [hardening issue #219](https://github.com/Mort2307/NightJar-Audio/issues/219). Passing build, source contracts, the Firestore emulator, a cloud deployment, or a preview is **not** evidence of production account behaviour.

**Evidence rules:** Record only a tester's role, device/browser, date, test identifier, PASS/FAIL/BLOCKED, and sanitized issue reference. **Never** put ID photos, document content, phone numbers, passwords, audio files, provider response bodies, access URLs, tokens or actual personal account details here. For real Didit use existing approved test accounts and their existing sessions. Do not start another paid ID check during QA.

| ID | Area / expected behaviour | Safe testing procedure | Outcome |
| --- | --- | --- | --- |
| C1 | Creator metadata autosave on phone and PC | On an approved Creator account edit private release title, tags, description, credits and schedule; confirm account Saved indicator, reload and compare on another device | NOT RUN |
| C2 | Creator concurrent edits conflict | Open one draft on phone and desktop, edit from both, verify stale device cannot replace later saved metadata silently; verify both conflict choices | NOT RUN |
| C3 | Creator offline and lost response | Disconnect during metadata save; ensure no false Saved indicator, restore connection and retry; simulate lost response after server commit and verify canonical revision is reconciled | NOT RUN |
| C4 | Creator permissions and submission | Confirm title/credits/schedule can autosave but file bytes, rights attestations and transcript accuracy declarations cannot be implicitly asserted; submitting requires canonical metadata acknowledgement and protected rights | NOT RUN |
| U1 | Creator upload, successful path | Approved VA selects owned test audio; transfer reaches Storage, server confirms attached; moderation remains separate | NOT RUN |
| U2 | Creator lost finalize response | Simulate a network/drop response after successful Storage upload; reopen same draft; **Recover uploaded recording** verifies same path with no re-upload or deletion | NOT RUN |
| U3 | Creator app reload after transfer | Return to same signed-in UID on same browser, verify pending reference is still available, and server rejects references from other accounts | NOT RUN |
| U4 | Creator failed bytes transfer | Break network **before** Storage confirms completion; no fake recovery or confirmed attachment appears; user can select original file again | NOT RUN |
| U5 | Creator invalid/too-large file | Unsupported MIME, 0-byte and >25 MiB audio must be rejected by client and backend/storage rules | NOT RUN |
| U6 | Editor audio finalize | Approved Editor uploads authorised before/after slot; interrupt after private item creation, reopen the draft, use Resume upload, and ensure confirmed slots are not reuploaded or duplicated; repeat finalize after lost response | NOT RUN |
| U9 | Concurrent Creator / Editor audio finalization | On the same draft, complete two distinct private transfers concurrently from separate sessions; first accepted upload wins, later stale attach is rejected, no submitted media replaced, and no displaced private bytes deleted during ambiguous finalisation | NOT RUN |
| U8 | Lost private record-creation response | For Creator, Artist and Editor on one approved account, drop the response after Firestore creation, retry from the same browser/device and verify exactly the original record is returned; a foreign UID may not reuse the record | NOT RUN |
| U7 | Artwork submission | Writer, VA and Artist submit owned artwork; for Artist interrupt after private record creation, reopen the draft and use Resume image upload with the original file reselected; an already pending image must not create another moderation request or public listing | NOT RUN |
| A1 | Writer saved manuscripts, iPad | Portrait and landscape: grid shows private titles, statuses and versions; tap title opens full editor, back returns to library | NOT RUN |
| A2 | Writer mobile/desktop access | Android/iPhone and desktop at 200% text: large tap targets, focus, grid search, status clarity and retained manuscript selection | NOT RUN |
| A3 | Writer cloud autosave | Edit private draft, wait for **Saved** acknowledgement, reopen on another signed-in device and confirm text/version | NOT RUN |
| A4 | Writer autosave conflict | Edit same manuscript on two devices; second stale writer must see conflict; first's latest content remains unchanged | NOT RUN |
| A5 | Writer network interruption | Disconnect after typing; unsynced warning remains, drafts not declared saved, and explicit retry works after reconnection | NOT RUN |
| A6 | Writer switch/exit | Try leaving or switching scripts with unsaved text; the member sees a clear warning and can choose to remain | NOT RUN |
| M1 | Writer to Admin | Submit a private Writer manuscript with rights attestations; new item appears in admin queue; no Editor assignment prerequisite | NOT RUN |
| M2 | Protected full-source preview | Admin opens TXT, DOCX and PDF test manuscripts; read-only preview must not leak public source or allow admin editing | NOT RUN |
| M3 | Admin decision and Writer view | Approve, request changes, reject with reason; Writer sees expected status, conversation entry and notification exactly for own account | NOT RUN |
| M4 | Concurrent review | Two admins reviewing same submitted test item: only one accepted decision; no inconsistent status or duplicate decision reason | NOT RUN |
| M5 | Marketplace boundaries | Admin approval must not publish whole manuscripts; only a Writer-approved public synopsis can become discoverable | NOT RUN |
| D1 | Didit verified return | Existing approved 18+ member returns to Nightjar after Didit, status refresh happens without creating a new paid session | NOT RUN |
| D2 | Didit negative routes | Unverified/revoked/under-18 accounts cannot reach adult content; pending/failed status does not silently bypass | NOT RUN |
| D3 | Didit re-login/notice | Approved member reloads on second device; existing verified status persists, with versioned notice acceptance if required | NOT RUN |
| S1 | Account isolation and permissions | Listener cannot access Writer/Editor/Artist private documents, moderation, callable writes, protected audio or admin logs | NOT RUN |
| S2 | Takedown/access revocation | Moderator removes/suspends content or account; stale clients and signed media URLs cannot restore unauthorised access | NOT RUN |
| S3 | Release and cost telemetry | Confirm no unintended new paid API, unbounded document scan, duplicate push fan-out or unexpected scheduled job | NOT RUN |
| M6 | Concurrent Editor showcase moderation | Use two authorized Admin accounts to approve/request changes on the same pending showcase simultaneously; exactly one decision commits with its reason and owner notification. Confirm second action is rejected as stale | NOT RUN |
| S5 | Admin moderation pages on mobile | With 20+ test audio uploads and 15+ test manuscripts, page through both queues at 200% text on phone and desktop; confirm bounded visible rows, disabled page boundaries and cleared selection/preview on page switch | NOT RUN |
| S4 | Mobile accessibility | 200% text, screenreader, keyboard, focus after error, reduced motion, 44+ px targets and contrast presets | NOT RUN |

## Execution and sign-off

- Automated: record CI run IDs for frontend build, Cloud Functions typecheck, contracts, security-emulator validation and backend-first deployment.
- Real provider: **existing** Didit approved session only; inspect read-only account status, never test chargeable creation.
- Tester: use consented, controlled test media/manuscripts owned by tester; keep production personal content out of QA reports.
- Release: record Firebase Hosting and any specifically selected deployed function names; confirm live version matches main.
- Go/no-go: any critical role/age/access, cross-device data loss, missing uploaded file, or misleading submission state is a **blocker**. Do not record a PASS until an actual device/account performed the scenario.
- Current status: no human/device checks in this document have been performed or certified. Automated checks must also be independently reviewed before declaring all five hardening jobs complete.

### 18 October safety note: displaced private media
Finalizing replacement audio now uses a server transaction that rechecks status and owner. Older attachments are deliberately **not deleted** as a side effect of finalization. Their storage cleanup remains a separate **NOT RUN** audit/removal workflow: no automatic deletion until their unreferenced status and age are verified server-side. Incomplete transfers and orphaned bytes are not claimed recovered or cleaned.
