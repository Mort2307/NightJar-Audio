# NightJar — real-account credited-release acceptance (checks 4–8 and 10)

**Status: NOT VERIFIED** until a human tester has completed the end-to-end steps with distinct authorised accounts. The backend emulator CI has already passed, but it is not evidence of real UI, account access or push delivery.

## Test set-up (no unnecessary identity charges)
- Prefer a dedicated **non-production Firebase staging project** with its own Auth, Firestore, Functions and Hosting; *do not point staging at production credentials or copy real ID documents*.
- Use **three consenting, already-verified adults** with different NightJar test accounts: A = uploader, B = credited listener/member, C = independent NightJar administrator. Reuse existing valid Didit decisions; do not initiate an extra paid session just to test credits.
- Create or use a release with legitimate attribution in staging. In production, use **only** a genuinely agreed published release with express permission of the uploader/contributor; no fabricated credit, public test release or forced role change.
- Do not put account UIDs, real identity details, API tokens or evidence documents into public GitHub issues.

## UI locations (current release)
- Member: **You/Profile → My credited releases → Claim a release credit**.
- Uploader: **You/Profile → My credited releases → Invite a contributor → Open invitation form**.
- Administrator: **Admin → Content → Credited account review**.
- Affected member: **You/Profile → Your credit requests and invitations** or a direct notification link.

## Six test outcomes
| Check | Test action | Pass evidence |
|---|---|---|
| 4. My credited releases | B selects published release and exact contributor name/role; submits | A sees a new claim in awaiting-uploader state; B sees request; different member cannot view it |
| 5. Uploader invitations | A selects own release and slot, searches for B in public member directory (or enters consented account ID), sends | B sees invitation and can accept/decline; unrelated member cannot accept it |
| 6. Credit confirmation | A confirms a member-initiated claim; separately disputes or marks another as unsure | B and independent C see correct state/notification; claims aren't silently approved |
| 7. Admin credit review | C approves a genuinely confirmed claim, rejects a different claim with a reason | Audit trail and credited profile update; A/B acting as administrator cannot approve their own claim |
| 8. Appeals and revocation | B appeals rejection/revocation; C resolves the appeal with reason, and (separately) revokes an approved credit | B sees correct status, audit recorded, revoked credit removed from public verification |
| 10. Credited Listener | B is a listener when C independently approves their genuine release contribution | B public profile shows **Credited Listener** and the relevant verified release; **no professional gold moon**, no upload privileges |

## What **does not** count as passing
- Merely seeing a route, button, menu or form.
- A demonstration using locally simulated states.
- An emulator unit/integration test without a successful authenticated end-user journey.
- A self-approved credit, a forced status change, a fictitious public release or a paid identity recheck.

If there is no safe staging environment or agreed credited release, record **NOT VERIFIED / BLOCKED — TEST DATA**. This is preferable to creating inaccurate public attribution.

## Evidence record
Record role (A/B/C only), platform (Android APK/PWA, iOS web or desktop), date, observed result, and PASS/FAIL/NOT VERIFIED. Share redacted screenshots if needed. Never store sensitive identity-verification or user documents in this file.
