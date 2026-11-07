# Private Writer → VA/Creator Assignment

Status: standalone feature in development. Tracking: #340.

## Product decision

A Writer must be able to start an assignment directly from a manuscript card, choose one approved active VA/Creator, and create a private Writer ↔ Creator collaboration. This is distinct from:
- NightJar's Admin manuscript review queue;
- public marketplace visibility and Creator-initiated interest;
- generic collaboration discovery;
- the existing three completed platform systems.

The existing collaboration proposal infrastructure is the preferred foundation. Do not create a second collaboration collection or parallel messaging system.

## Current source baseline (7 November 2026)

- `WriterManuscriptGrid` renders each private script card but has no direct assignment action.
- Writer Studio already mounts `CollaborationHub` in a separate expandable workspace.
- `CollaborationHub` already lets a Writer select a script and Creator/Editor, enter a message, payment proposal and licence summary, then call `sendCollaborationProposal`.
- The backend checks script ownership and active recipient account role, creates a `collaborationProposals` record, and sends a targeted notification.
- Existing proposal lifecycle supports sent/interested/discussing/accepted/declined/withdrawn/in-production/completed.
- Existing payload and record currently do not snapshot script version or explicitly distinguish a private assignment from a general proposal. The UI does not offer an assignment action on each script card.
- Firestore client rules deny direct reads/writes; sensitive reads and mutations must remain behind callable backend authorization.

## Target user journey

1. Writer opens My Manuscripts and selects **Assign to Creator** on a script card.
2. A focused assignment composer opens with that script preselected and its title/version visible.
3. Writer searches approved, active VA/Creator accounts and selects exactly one recipient. Do not default-select a person.
4. Writer adds a private note, optional requested delivery date, and clearly labelled proposed writer/creator fees and rights summary. Empty terms remain explicitly “to be agreed”; never infer ownership or payment.
5. Before sending, show a confirmation summary naming the exact recipient and selected script/version.
6. Backend validates Writer role, script ownership, recipient active status and approved professional Creator role; creates one idempotent private assignment/proposal and targeted notification.
7. The selected Creator sees the assignment in their private Collaborations workspace and can accept or decline. Writer sees the current state and can withdraw a pending request.
8. On acceptance, preserve the script version snapshot. Later script edits must not silently change what was offered; revisions need an explicit new version/revision agreement.
9. Assignment never changes marketplace visibility, publication status, ownership, licence, payment settlement or release credit automatically.

## Roles and visibility

- Writer: sees assignments where `writerUserId` is their authenticated UID.
- Recipient: sees assignments where `recipientUserId` is their authenticated UID.
- Other creators/writers/listeners: no access, including by guessed document ID.
- Admin: existing moderation/administrative access only where an explicit current backend callable grants it; do not broaden by default.
- Notification payload: title, sender display name and opaque assignment ID only; no manuscript text, source file URL or private note.
- Protected manuscript content remains served through existing protected script access paths after explicit server permission.

## Work, rights and payment distinctions

Assignment relationship does not determine the legal work type. Preserve explicit selection/record of:
- Voluntary submission: writer retains copyright; NightJar hosting licence remains as agreed.
- Private commission: named commissioning party, agreed ownership/licence and fee must be recorded before acceptance.
- NightJar Original: separate NightJar commission/ownership agreement.

Keep Writer fee and VA/Creator fee as distinct obligations. Do not automatically add either to the subscription-funded Creator Pool or trigger payment. Record proposal and agreed terms separately from payment status. Only an existing, explicitly approved payout workflow may execute payment.

## Implementation guardrails

- Reuse `collaborationProposals`, `sendCollaborationProposal`, and the existing private collaboration workspace unless source review proves a separate record is necessary.
- Add a script-card action that preselects the script in the assignment composer. Keep the existing collaboration directory as the recipient picker.
- Enforce all checks on the backend; frontend filtering is convenience only.
- Add idempotency and transaction/state guards where necessary to prevent duplicate assignments and double acceptance.
- Do not expose full manuscript text in list results, notifications, logs, public profile/search or recipient directory.
- No new scheduler, Cloud Tasks, Pub/Sub, paid API, tracker or broadcast fan-out.
- Preserve CLOSED_BETA, Didit, moderation, subscription and launch gates.
- Follow `AGENTS.md`, `docs/HUMAN_FIRST_UX_STANDARD.md` and Midnight Gold tokens.

## Acceptance checklist

- [ ] Script card has accessible **Assign to Creator** action.
- [ ] Composer opens with correct script/version preselected.
- [ ] Only approved active VA/Creator accounts can be assigned.
- [ ] Writer can search and explicitly select one recipient.
- [ ] Preview confirms recipient, script/version, rights type and proposed terms.
- [ ] Send creates one durable record and one targeted notification.
- [ ] Creator sees only their own incoming assignments and can accept/decline.
- [ ] Writer sees outgoing assignments and can withdraw pending assignment.
- [ ] Other accounts cannot list, open or infer private assignment/script content.
- [ ] Script version is snapshotted; later edits do not silently mutate accepted work.
- [ ] Rights and Writer/Creator fees remain separate and non-automated.
- [ ] Multi-role accounts do not create duplicate identities or payment obligations.
- [ ] Loading, empty, error, retry and success states are honest and accessible.
- [ ] Typecheck, build, relevant source contracts and full validation pass.
- [ ] Backend-first release gate, Hosting, Build and Validation links recorded separately.
- [ ] Human acceptance on Android and desktop recorded separately from CI.
