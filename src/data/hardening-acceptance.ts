/** Hardening acceptance only. A PR/CI/production deploy never marks a manual case PASS. */
export const hardeningAcceptance = [
  {
    "id": "hardening_C1",
    "caseId": "C1",
    "title": "Creator metadata autosave on phone and PC",
    "procedure": "On an approved Creator account edit private release title, tags, description, credits and schedule; confirm account Saved indicator, reload and compare on another device"
  },
  {
    "id": "hardening_C2",
    "caseId": "C2",
    "title": "Creator concurrent edits conflict",
    "procedure": "Open one draft on phone and desktop, edit from both, verify stale device cannot replace later saved metadata silently; verify both conflict choices"
  },
  {
    "id": "hardening_C3",
    "caseId": "C3",
    "title": "Creator offline and lost response",
    "procedure": "Disconnect during metadata save; ensure no false Saved indicator, restore connection and retry; simulate lost response after server commit and verify canonical revision is reconciled"
  },
  {
    "id": "hardening_C4",
    "caseId": "C4",
    "title": "Creator permissions and submission",
    "procedure": "Confirm title/credits/schedule can autosave but file bytes, rights attestations and transcript accuracy declarations cannot be implicitly asserted; submitting requires canonical metadata acknowledgement and protected rights"
  },
  {
    "id": "hardening_U1",
    "caseId": "U1",
    "title": "Creator upload, successful path",
    "procedure": "Approved VA selects owned test audio; transfer reaches Storage, server confirms attached; moderation remains separate"
  },
  {
    "id": "hardening_U2",
    "caseId": "U2",
    "title": "Creator lost finalize response",
    "procedure": "Simulate a network/drop response after successful Storage upload; reopen same draft; **Recover uploaded recording** verifies same path with no re-upload or deletion"
  },
  {
    "id": "hardening_U3",
    "caseId": "U3",
    "title": "Creator app reload after transfer",
    "procedure": "Return to same signed-in UID on same browser, verify pending reference is still available, and server rejects references from other accounts"
  },
  {
    "id": "hardening_U4",
    "caseId": "U4",
    "title": "Creator failed bytes transfer",
    "procedure": "Break network **before** Storage confirms completion; no fake recovery or confirmed attachment appears; user can select original file again"
  },
  {
    "id": "hardening_U5",
    "caseId": "U5",
    "title": "Creator invalid/too-large file",
    "procedure": "Unsupported MIME, 0-byte and >25 MiB audio must be rejected by client and backend/storage rules"
  },
  {
    "id": "hardening_U6",
    "caseId": "U6",
    "title": "Editor audio finalize",
    "procedure": "Approved Editor uploads authorised before/after slot; interrupt after private item creation, reopen the draft, use Resume upload, and ensure confirmed slots are not reuploaded or duplicated; repeat finalize after lost response"
  },
  {
    "id": "hardening_U9",
    "caseId": "U9",
    "title": "Concurrent Creator and Editor audio finalization",
    "procedure": "Two approved sessions upload distinct private files to the same draft; stale finalizer must reject rather than replace newer or submitted audio; no early deletion of displaced media"
  },
  {
    "id": "hardening_U8",
    "caseId": "U8",
    "title": "Lost private record-creation response",
    "procedure": "For Creator, Artist and Editor on one approved account, drop the response after Firestore creation, retry from the same browser/device and verify exactly the original record is returned; a foreign UID may not reuse the record"
  },
  {
    "id": "hardening_U10",
    "caseId": "U10",
    "title": "Read-only orphan audio audit",
    "procedure": "As Admin select a release with an attached recording and one known unattached test transfer. Inspect private Storage and confirm owner-scoped records, 30-item bound, correct age flags and no file deleted. Verify Listener/Creator cannot invoke this Admin callable"
  },
  {
    "id": "hardening_U7",
    "caseId": "U7",
    "title": "Artwork submission",
    "procedure": "Writer, VA and Artist submit owned artwork; for Artist interrupt after private record creation, reopen the draft and use Resume image upload with the original file reselected; an already pending image must not create another moderation request or public listing"
  },
  {
    "id": "hardening_A1",
    "caseId": "A1",
    "title": "Writer saved manuscripts, iPad",
    "procedure": "Portrait and landscape: grid shows private titles, statuses and versions; tap title opens full editor, back returns to library"
  },
  {
    "id": "hardening_A2",
    "caseId": "A2",
    "title": "Writer mobile/desktop access",
    "procedure": "Android/iPhone and desktop at 200% text: large tap targets, focus, grid search, status clarity and retained manuscript selection"
  },
  {
    "id": "hardening_A3",
    "caseId": "A3",
    "title": "Writer cloud autosave",
    "procedure": "Edit private draft, wait for **Saved** acknowledgement, reopen on another signed-in device and confirm text/version"
  },
  {
    "id": "hardening_A4",
    "caseId": "A4",
    "title": "Writer autosave conflict",
    "procedure": "Edit same manuscript on two devices; second stale writer must see conflict; first's latest content remains unchanged"
  },
  {
    "id": "hardening_A5",
    "caseId": "A5",
    "title": "Writer network interruption",
    "procedure": "Disconnect after typing; unsynced warning remains, drafts not declared saved, and explicit retry works after reconnection"
  },
  {
    "id": "hardening_A6",
    "caseId": "A6",
    "title": "Writer switch/exit",
    "procedure": "Try leaving or switching scripts with unsaved text; the member sees a clear warning and can choose to remain"
  },
  {
    "id": "hardening_M1",
    "caseId": "M1",
    "title": "Writer to Admin",
    "procedure": "Submit a private Writer manuscript with rights attestations; new item appears in admin queue; no Editor assignment prerequisite"
  },
  {
    "id": "hardening_M2",
    "caseId": "M2",
    "title": "Protected full-source preview",
    "procedure": "Admin opens TXT, DOCX and PDF test manuscripts; read-only preview must not leak public source or allow admin editing"
  },
  {
    "id": "hardening_M3",
    "caseId": "M3",
    "title": "Admin decision and Writer view",
    "procedure": "Approve, request changes, reject with reason; Writer sees expected status, conversation entry and notification exactly for own account"
  },
  {
    "id": "hardening_M4",
    "caseId": "M4",
    "title": "Concurrent review",
    "procedure": "Two admins reviewing same submitted test item: only one accepted decision; no inconsistent status or duplicate decision reason"
  },
  {
    "id": "hardening_M5",
    "caseId": "M5",
    "title": "Marketplace boundaries",
    "procedure": "Admin approval must not publish whole manuscripts; only a Writer-approved public synopsis can become discoverable"
  },
  {
    "id": "hardening_D1",
    "caseId": "D1",
    "title": "Didit verified return",
    "procedure": "Existing approved 18+ member returns to Nightjar after Didit, status refresh happens without creating a new paid session"
  },
  {
    "id": "hardening_D2",
    "caseId": "D2",
    "title": "Didit negative routes",
    "procedure": "Unverified/revoked/under-18 accounts cannot reach adult content; pending/failed status does not silently bypass"
  },
  {
    "id": "hardening_D3",
    "caseId": "D3",
    "title": "Didit re-login/notice",
    "procedure": "Approved member reloads on second device; existing verified status persists, with versioned notice acceptance if required"
  },
  {
    "id": "hardening_S1",
    "caseId": "S1",
    "title": "Account isolation and permissions",
    "procedure": "Listener cannot access Writer/Editor/Artist private documents, moderation, callable writes, protected audio or admin logs"
  },
  {
    "id": "hardening_S2",
    "caseId": "S2",
    "title": "Takedown/access revocation",
    "procedure": "Moderator removes/suspends content or account; stale clients and signed media URLs cannot restore unauthorised access"
  },
  {
    "id": "hardening_S3",
    "caseId": "S3",
    "title": "Release and cost telemetry",
    "procedure": "Confirm no unintended new paid API, unbounded document scan, duplicate push fan-out or unexpected scheduled job"
  },
  {
    "id": "hardening_N1",
    "caseId": "N1",
    "title": "Notification dedupe, read state and retries",
    "procedure": "Repeat the same keyed event on an approved account; verify a single inbox entry and no duplicate push or unread reset; initial FCM failure cannot erase the inbox entry"
  },
  {
    "id": "hardening_M6",
    "caseId": "M6",
    "title": "Concurrent Editor showcase moderation",
    "procedure": "Use two authorized Admin accounts to approve/request changes on the same pending showcase simultaneously; exactly one decision commits with its reason and owner notification. Confirm second action is rejected as stale"
  },
  {
    "id": "hardening_S6",
    "caseId": "S6",
    "title": "Backend Admin queue pagination",
    "procedure": "With more than 60 private release records and more than 30 pending moderation submissions, load further batches and confirm every owned recording remains available, counts are honest, no duplicates, and non-Admin calls are rejected"
  },
  {
    "id": "hardening_S5",
    "caseId": "S5",
    "title": "Admin moderation pages on mobile",
    "procedure": "With 20+ test audio uploads and 15+ test manuscripts, page through both queues at 200% text on phone and desktop; confirm bounded visible rows, disabled page boundaries and cleared selection/preview on page switch"
  },
  {
    "id": "hardening_S4",
    "caseId": "S4",
    "title": "Mobile accessibility",
    "procedure": "200% text, screenreader, keyboard, focus after error, reduced motion, 44+ px targets and contrast presets"
  }
] as const;
