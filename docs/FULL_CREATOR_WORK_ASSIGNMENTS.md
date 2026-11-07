# Full Creator Work Assignments

Status: implementation in progress on feat/full-creator-work-collaboration-20261107.

## Product scope

NightJar's private assignment workflow supports approved professionals assigning work they own to another approved professional. It is not restricted to manuscripts.

Current asset adapters:
- Writer manuscript text.
- Creator release audio.
- Creator release cover artwork.
- Writer manuscript cover artwork.
- Artist portfolio artwork.
- Audio Editor showcase before/after recordings.

The adapter boundary is intentionally extensible. New asset types must be added with explicit ownership, revision, media and access rules; never infer access from a client-supplied owner ID or storage path.

## Direction and roles

A Creator, Writer, Artist or Audio Editor may invite another active account with an approved professional role. This supports Creator → Creator, Creator → Writer, Creator → Artist, Creator → Editor and equivalent valid combinations. Multi-role accounts remain one account identity. The invited account sees an incoming assignment independent of which of its approved roles is currently selected in the UI.

The existing Writer → Creator manuscript-card assignment remains separate and intact.

## Security model

- Every asset adapter checks the authenticated owner's correct owner field server-side.
- Artwork adapters verify the referenced imageAssets record's owner, moderation state, kind and target ID. Cross-type image IDs are rejected.
- Assignment records are stored in creatorWorkAssignments; list callables return only records where the caller is owner or recipient.
- Acceptance checks the immutable asset revision again inside the Firestore transaction. Changed work requires a fresh invitation.
- Original export is not granted; no download action is exposed. Audio/image preview URLs are signed for five minutes. Browser, screen or audio capture cannot be technically prevented and must not be represented as impossible.
- Script text is returned only after an accepted assignment and current revision check.
- Withdrawal changes the authoritative assignment state; future open calls are denied. Previously issued signed URLs expire within five minutes.
- Assignment events are retained in the assignment's events subcollection.
- No automatic public credits, publication, ownership transfer or payment is triggered.

## Money boundary

NightJar does not collect, hold, route, settle or record creator-to-creator transactions. Any private arrangement between creators remains outside NightJar. This feature contains no payment proposal, payment ledger, checkout, escrow or Stripe Connect integration. NightJar's direct obligations to its own creators remain governed by the separate NightJar finance process.

## Validation

The creator-work-assignment-contracts.mjs source contract is part of npm run validate:contracts. Full acceptance still requires TypeScript/build, Functions checks, security/emulator tests, all existing release contracts, PR review and manual Android/desktop verification before merge or deployment.
