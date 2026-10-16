# Verified Credit Claim System — deployment gate

Status: **NOT READY TO MERGE OR DEPLOY**. This branch currently contains only domain types and pure state transitions.

## Existing system risks confirmed by code review
- Release contributors are normalised to {userId,name,role} and may be supplied by the uploader. They are **attribution**, not verified account ownership.
- Public profile release-credit loading is restricted to approved writer/editor accounts; credited listeners and credited VA/artists need separate queries.
- Professional directory moon badge currently checks role/category membership, while public profiles check server approvedProfessionalRoles. Unify on server approval.
- Profile lookup scans a capped number of released documents; introduce indexed account-linked credit records before growth.
- Existing contributor IDs are used for notifications and some permissions. Never blindly convert legacy IDs into verified credit records or grant privileged access on claim submission.

## Required backend endpoints
1. createCreditClaim: authenticated, age-verified account; released release; existing credit slot; transactionally prevent duplicate active claims.
2. inviteCreditedContributor: authenticated authorised release uploader; invite an existing account; invitation does not itself verify identity.
3. respondToCreditInvitation: claimant only; accept/decline; cannot approve own claim.
4. respondToCreditClaim: uploader only; confirm/dispute/unsure with reason; record actor and timestamp; self-upload claims require independent corroboration.
5. reviewCreditClaim: admin only; approve/reject; transactional verification of evidence, claim state and contributor slot; immutable audit events.
6. revokeCreditLink: admin only; revoke link without erasing attribution or historical audit records.
7. listMyCreditClaims/listAdminCreditClaims: caller-scoped data and admin-only queues, pagination and indexes.

## Suggested Firestore structure
- creditClaims/{claimId}: releaseId, contributorSlotId, claimantUserId, uploaderUserId, profession, source, state, createdAt, updatedAt, decision metadata.
- creditClaims/{claimId}/events/{eventId}: append-only actor, action, timestamp, reason (admin scoped).
- verifiedCredits/{creditId}: releaseId, contributorSlotId, userId, profession, approvedAt, approvedByAdminUserId, revokedAt.
- Existing releases/{releaseId}.contributors remains the attribution source until a verified link exists.

No client writes to creditClaims/verifiedCredits; use privileged server functions. Firestore security rules should deny direct writes. Avoid public exposure of evidence, email addresses, ID data, and internal admin notes.

## Product integration
- Release: 'I'm credited' and uploader invite, with a clear claim status.
- Notifications: claimant, uploader, admin; deduplicated and deep-linked.
- Admin: pending, confirmed, disputed, unsure, expired, resolved queues; decision notes and evidence; correction/revoke.
- Profile: 🎧 credited role chips and linked releases; 🌙 only with approvedProfessionalRoles.
- Directory: distinguish credited contributors from onboarded professionals; preserve current access controls.

## Mandatory test matrix
- Role spoofing, unauthenticated calls, uploader/claimant UID spoofing, admin spoofing.
- Duplicate and concurrent claims, wrong release/slot, deleted or unpublished releases, renamed handles.
- Claimant = uploader, unresponsive uploader, disputes, appeal/revocation, stale decisions.
- Multi-role credits, old records, no role escalation, private information leakage.
- Verify existing Didit approvals remain unchanged; **do not trigger paid Didit checks**.
- Run npm run typecheck, npm run build, relevant contract tests, security rules tests, and end-to-end role checks.
- Only merge after all mandatory endpoints, UI and test gates are complete and green. Deploy separately after review.
