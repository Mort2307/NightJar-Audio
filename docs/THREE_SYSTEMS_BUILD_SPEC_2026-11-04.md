# Nightjar: Profile Types, Commitments and Compensation Centre
Date: 4 November 2026
Status: active implementation in PR #336; not yet released to production.

## Delivery boundary
Development continues on `feat/profile-commitments-compensation-centre`. A separate Firebase staging project is not required or being provisioned. Pull requests run automated validation and production-bundle builds only; they do not deploy Hosting, Functions or data rules. Live-app acceptance will happen in controlled increments after CI passes and Mike explicitly approves each release. No payment, payout, tax remittance, identity-check charge or production data migration is triggered automatically.

## Current implementation status — 5 November 2026

| Area | Implemented in this branch | Remaining delivery / acceptance |
|---|---|---|
| Profile Types | Authenticated settings persistence with revision checks; approved-role gating; public/unlisted/private projections; directory filtering; member controls in the existing Profile Studio | Live acceptance of each profile type and visibility state on desktop and Android |
| Commitments | Versioned role templates; monthly periods; admin assignment; member evidence submission; admin review and documented exceptions; server-side role eligibility; member progress panel; admin Commitment Control Centre mounted in Contributors | Assignments are currently administered manually by account UID; evidence accepts a note and/or external HTTPS reference, not Nightjar-hosted file uploads; live member/admin acceptance |
| Compensation | Manual Stripe settlement-report entry and reconciliation; refunds, chargebacks, fees, VAT and adjustments; 50% Creator Pool; deterministic equal shares by individual; approved payout ledger; manual payment references; separate tax reserve/liability/payment ledger; member-only compensation history; admin Compensation Control Centre mounted in Contributors | Automatic Stripe settlement ingestion and bank transfers are not implemented; the remaining 50% allocation and accountant-approved tax treatment remain separate owner/accountant decisions |
| Experience | Member and admin workflows connected to the existing Nightjar app, with Midnight Gold styling and loading/error/empty states in the new control surfaces | Complete manual desktop/Android acceptance, accessibility review and final usability corrections |
| Security | Server-authoritative role, evidence, eligibility and finance callables; admin-only financial controls; integer-pence calculations; idempotent payment references; CI contract and emulator coverage | Final production acceptance and controlled verification against the live app |

The 4 November design notes below remain useful as the product and security contract. Their original “still required” checklist is a historical snapshot and is superseded by this current status table.

### Non-negotiable integration boundaries

- A profile type is presentation metadata. It must never be used as proof of an approved role.
- An approved professional role comes from the existing account approval state, not a profile document, selected tab, role label or user-supplied payload.
- Commitment eligibility must be calculated on the server from immutable, period-scoped assignments and reviewed evidence. The client may display progress but cannot mark itself eligible.
- The allocator receives a server-derived eligible-user set and an already-reconciled Creator Pool amount. It must never accept a client-calculated revenue or pool figure.
- Finance Lab scenarios are not ledger entries. Preview and simulation mode must remain visibly separate from live finance.
- A tax reserve is a cash-management entry, not a tax rate, tax liability or payment. The legal entity, VAT treatment and tax rules are not yet confirmed.
- Meg and Mike's 50/50 ownership is not a mandate to distribute 50% of monthly receipts to the owners. Owner distributions must be a separate, effective-dated policy and subject to cash, tax and legal constraints.
- No live Stripe price, customer billing agreement, payout, bank payment, production Firestore record or production deployment is changed by this branch.

## Intelligence preservation contract

These systems must preserve Nightjar's existing rule-driven behaviour and become more explainable, not less:

- **One identity, multiple role contexts:** account identity, age assurance, legal acceptance and approved-role state remain canonical. A profile type is never an entitlement.
- **Server-authoritative decisions:** clients can submit profile edits, evidence and requests; only trusted callables can approve roles, accept evidence, calculate eligibility, close periods or mark payments reconciled.
- **Explainable eligibility:** retain the role-by-role result, template version, applicable mandatory task count, approved evidence references, exception reason and the single qualifying role used for that period. The UI should be able to explain exactly why someone qualifies or does not.
- **No role-count inflation:** evaluate every approved role independently, then combine results with logical OR. Deduplicate by account UID before calculating one equal share.
- **No popularity weighting:** follows, listens, downloads, social reach and profile visibility never alter a creator's base share.
- **No silent defaults:** no assignment is not 100% completion; missing evidence is not approval; a profile badge is not role approval; a subscription status is not settled revenue; a reserve is not tax paid.
- **Versioned policy:** commitment templates and finance policies are immutable once used by an open or closed period. New versions apply prospectively, with the exact policy version stored on each period.
- **Deterministic accounting:** calculate in integer pence, preserve source references, make rounding visible and use idempotency keys/transactions to prevent duplicate payout or payment records.
- **Reversible operations:** allow draft previews and dry-runs; corrections use separately audited adjustment entries. Do not rewrite closed periods or automatically send money.
- **Failure behaviour:** if a source is unavailable, incomplete or inconsistent, stop the affected calculation and show the missing reconciliation item. Never silently fall back to an estimated MRR figure for a payout run.

## Screen and workflow design

### Member-facing
1. **My Profiles** — profile-type switcher; shared account identity; independent profile headline, biography, specialties, selected portfolio items and visibility; explicit preview of public presentation; no professional approval action.
2. **My Commitments** — period selector; role cards; mandatory and optional tasks; due dates; evidence upload/reference; submission state; reviewer feedback; blocker/exception state; clear explanation that one fully completed approved role qualifies for one share.
3. **My Compensation** — current period status, eligibility reason, approved role that qualified, calculation status, gross share, adjustments and payment reference/status. Never show another contributor's private financial details.

### Admin-facing
1. **Profile Review** — moderation/public visibility view and profile-type diagnostics, separate from professional applications and approval.
2. **Commitment Control** — versioned role templates, effective dates, period assignments, task definitions, evidence review, exception/reassignment reason, eligibility preview and immutable audit history.
3. **Compensation Control Centre** — source reconciliation, eligible net revenue bridge, 50% Creator Pool, equal-share calculation, allocation waterfall, pending review, manual payment records, tax reserve/liability/payment ledger, period close and adjustment workflow.

### Critical workflow logic

| Trigger | Server-side condition | Action | Result |
|---|---|---|---|
| Member saves a profile type | Authenticated active account; type in allowlist; owner is caller | Validate and save profile metadata | Profile changes only; no role or entitlement change |
| Public profile is requested | Profile type enabled and visibility permits public display; account is active; role-specific content is authorised | Return a minimal public projection | Hidden/private fields are not returned |
| Admin publishes a commitment template | Admin; valid role/tasks/dates; no conflicting active version | Create a new immutable version | Existing periods keep their original template |
| Member submits task evidence | Assignment belongs to caller; period open; task is assigned | Store evidence reference and mark submitted | Awaiting review; not complete yet |
| Reviewer approves evidence | Admin/authorised reviewer; evidence belongs to assignment | Append review event and update task state | Progress recalculated by trusted backend |
| Period eligibility is calculated | Active account; approved role; effective assignment; all applicable mandatory tasks approved or explicitly excused with audited reason | Evaluate each role, then OR across approved roles | One person qualifies once if any one role is complete |
| Monthly compensation is prepared | Reconciled eligible net revenue and effective policy exist; period not closed | Calculate 50% Creator Pool and deduplicated equal shares in pence | Draft payout ledger ready for review |
| Admin records a payment | Admin; payout exists; positive amount; reference/date supplied | Append payment record and reconcile balance | Status becomes paid only when fully reconciled |
| Admin records a tax payment | Admin; tax ledger liability exists; reference/date/amount supplied | Append payment against liability | Reserve is not mistaken for tax paid |

## Implementation progress — backend and screen integration

The branch now includes the following implementation beyond the original preview:

### Profile Types
- Authenticated `getMyProfileTypeSettings` and `saveMyProfileTypeSettings` callables with optimistic revision checks.
- The canonical role-specific profile content remains `profiles/{uid}.roleProfiles`; the new `profileTypeSettings` map stores only enabled/visibility settings, not duplicate biography or portfolio content.
- Member-facing controls are mounted in the existing profile studio.
- The direct public-profile callable and public directory projections filter role content using approved account roles and profile visibility.
- Legacy accounts without explicit settings retain their previous approved-role visibility until they save settings.
- Visibility policy is covered by unit tests for legacy behaviour, unapproved roles, private/unlisted profiles and owner preview.

### Commitment Tracking
- Versioned role templates, monthly period creation, individual assignments, member evidence submission, admin review decisions, documented eligibility exceptions and period closure are implemented as authenticated callable workflows.
- Member-facing progress and evidence submission are mounted in the profile workspace.
- The administrator Commitment Control Centre is mounted in the Contributors workspace and supports template creation, period creation, manual assignment by account UID, evidence review and exceptions.
- Eligibility is calculated server-side from approved roles and reviewed task states. With no assignment, no evidence approval or no completed approved role, the member does not qualify.
- Period-specific evaluation now selects the latest open assessment period by default; a closed period can still be queried for historical eligibility.
- Current limitation: assignment is an administrator-directed workflow, not yet a scheduled bulk monthly assignment process. Evidence is a note and/or external HTTPS reference; Nightjar-hosted evidence-file upload is not yet wired into this workflow.

### Compensation Control Centre
- Manual Stripe settlement import records gross receipts, refunds, chargebacks, processor fees, VAT and other deductions in integer pence.
- Eligible net revenue is calculated as gross less those recorded deductions. Each source entry requires a Stripe external reference, settlement date and report reference, then a separate reconciliation note.
- A Creator Pool calculation is blocked until the commitment period is closed and all settlement entries for that period are reconciled.
- The backend applies the immutable finance policy effective for the accounting month, then divides the configured Creator Pool equally between eligible individuals using server-derived approved-role and commitment records.
- Revenue is locked once the payout period is prepared. The payout ledger is immutable in its calculation; manual payment records are appended separately and duplicate references are idempotent.
- The admin Compensation Control Centre now saves versioned monthly policies with a complete 100% split across Creator, NightJar operations and the Meg & Mike pool. A split cannot be saved while it does not reconcile. Closed periods and earlier policies cannot be rewritten. The Meg & Mike pool is an accounting allocation only, not an automatic owner payout.
- Member-facing compensation history shows only that member's own share, payment records and outstanding amount.
- A separate manual tax ledger records a cash reserve, accountant-confirmed liability and actual tax payments. It does not calculate a tax rate or infer a legal entity.
- No bank transfer or Stripe Connect payout is initiated.

- Each payout period stores its policy version/effective date, subscription-price planning value and all three pool percentages/amounts as a calculation snapshot. The three pools use integer-pence largest-remainder rounding, so the allocation reconciles exactly.
- The monthly subscription price is planning-only for new subscribers; saving a finance policy does not create/update Stripe Prices or alter existing customer billing agreements. Historical payout snapshots are not recalculated by later policies.
- Reusing a manual creator or tax payment reference is idempotent only when the period, amount, date, reference and (for creator payments) recipient match. A conflicting retry is rejected and must use a new correction reference.
- The subscription-price field is not used to infer cash receipts. Only reconciled settlement records feed the pool calculation.

### Financial integration boundary
The current revenue intake is a controlled manual Stripe payout/balance-report import. It is deliberately not described as a live Stripe webhook integration. Automatic ingestion of signed Stripe events, processor balance transactions and app-store billing streams remains future work. Until that is built and independently reconciled, the admin must source and reconcile each settlement from Stripe reports; MRR, trial status or unpaid invoices must never be used as cash received.

### Current test coverage
- Profile type allowlist and visibility projection tests.
- Commitment eligibility tests including multiple roles, mandatory/optional tasks and audited exceptions.
- Equal-share allocator tests including duplicate identities, deterministic remainder and zero eligible members.
- Revenue settlement arithmetic tests including deductions and invalid values; effective finance-policy validation, exact three-pool penny allocation and conflicting payment-reference retries.
- The unified Functions test command is `npm run test:systems`, wired into PR preflight.

## Release sequence

1. **Foundation and contracts:** finalise schemas, callable request/response contracts, role allowlists, period keys, audit event shape and migration/backfill rules.
2. **Profile system:** implement callable persistence and server-filtered public projections; connect the existing profile studio without duplicating identity or role approvals.
3. **Commitment system:** implement template/version administration, assignment lifecycle, evidence/review and server eligibility calculation; test cancelled work and Nightjar-caused blockers.
4. **Compensation system:** verify payment-provider data lineage; implement reconciliation and immutable period ledger; connect allocator only after eligibility and revenue are server-derived.
5. **Experience and QA:** connect member/admin screens, accessibility, responsive layouts, empty/error/loading states, emulator tests and live-app acceptance screenshots.
6. **Migration and release:** dry-run migration, compare old/new outputs without paying anyone, obtain owner/accountant decisions, user acceptance, staged rollout and rollback plan.

## Findings from the current main branch
- Nightjar already has a multi-professional-role account model. `myProfessionalRoles`, `submitProfessionalApplication` and admin role management govern approval and workspace access.
- `UserProfileStudio`, `RoleProfileExtension` and `PublicProfile` already support shared identity, the `roleProfiles` map, role-specific presentation and a server-derived Credited Listener state. The new profile-type layer must extend this model rather than create a competing identity/profile store or weaken professional approvals.
- Existing commercial settings are stored in `settings/commercial`, with callable endpoints `commercialOverview`, `saveCommercialSettings` and `creatorCompensationStatus`.
- The existing `subscriptions` collection and `listBillingSubscriptions` callable expose account, plan, status, confirmed monthly amount and period end. Stripe is the intended web/PWA revenue source from the earlier finance design, but a repository scan did not find Stripe invoice/settlement/refund/chargeback webhook ingestion or a processor fee ledger in the current Functions code. Therefore active MRR is not sufficient evidence for cash received or eligible net revenue; the compensation engine must not treat it as settled income. The implementation needs a verified Stripe event/settlement ingestion path with idempotency and reconciliation, plus explicit treatment of any app-store billing streams where those apply.
- The existing public profile callable already derives approved roles and verified credits server-side, and `PublicProfile` already distinguishes Credited Listener from professional approval. It currently returns the stored `roleProfiles` map as a public payload, so per-profile visibility must be enforced in the callable projection before new visibility controls are exposed.
- The current compensation implementation is `capped_equal_rate`: paid Creator slots, subscriber rate bands, monthly caps and capacity/stress checks. This conflicts with the agreed commitment-qualified equal-share pool and must not be silently mixed with it.
- The current Finance Lab is a local-storage scenario simulator. It is not an authoritative ledger and must remain visibly separate from live financial records.
- The existing commercial allocation currently reconciles Creator, company-profit and business-fund percentages to 100%. The new design needs a separately defined tax reserve and a clear allocation waterfall so tax is not double-counted or confused with distributable net revenue.

## System 1 — Profile Type Manager
### Product rules
- One account and one identity; a member may create and manage separate Listener, VA Creator, Writer, Audio Editor and Artist profile sections.
- Creating or displaying a profile type does not grant a professional role, workspace, marketplace access, badge, age-gate exemption or compensation eligibility.
- Professional access remains governed exclusively by the existing application, legal acceptance, age-assurance and administrator approval workflows.
- Profile sections have independent headline, biography, skills/specialties, portfolio selections and public visibility. Shared account identity and security remain singular.
- Hiding a profile section does not delete work, account roles, credits, messages or approved assets.
- Removal requires a clear confirmation and must preserve underlying creative records and evidence.
- Public profile queries must enforce visibility server-side; hidden profile data must not leak through public directory payloads.

### Proposed data shape
`accounts/{uid}/profileTypes/{type}`: type, enabled, visibility, headline, bio, specialties, portfolioItemIds, createdAt, updatedAt, schemaVersion.
Allowed types are a fixed allowlist. Role permissions are never inferred from this collection.

## System 2 — Commitment Tracker
### Product rules
- Commitment templates are versioned and role-specific, with effective-from and effective-to dates, assessment period, due dates, mandatory/optional tasks, evidence requirements and completion thresholds.
- A person is eligible for compensation when at least one approved creative role has completed 100% of the mandatory commitments applicable to that role and period.
- Holding several roles does not multiply a person's share and does not require completion of every role.
- A role without an assigned commitment set cannot be treated as complete by default; it must be explicitly marked not applicable by an authorised administrator with a reason.
- Creator-caused incomplete work is distinct from Nightjar-caused blockers, cancelled assignments, approved leave and documented exceptions.
- Rule changes are versioned and effective prospectively. Never recalculate a closed period using later rules.
- Evidence, reviewer decisions, exceptions, reassignment and status transitions are audit logged.
- Members see their own tasks, progress, due dates, blockers and review outcomes. Administrators see the operational overview and can correct records with a reason.

### Proposed data shape
- `commitmentTemplates/{templateId}`: role, version, periodType, effectiveFrom, effectiveTo, tasks, thresholds, status, createdBy.
- `commitmentAssignments/{assignmentId}`: userId, role, templateId, periodKey, taskStates, completionPercent, eligibilityState, exceptionState, evidenceRefs, reviewedBy, timestamps.
- `commitmentAudit/{eventId}`: actor, subject, action, before/after summary, reason, timestamp.

## System 3 — Compensation Control Centre
### Product rules
- Financial calculations use authoritative payment-provider and settlement records, not Finance Lab assumptions or guessed subscriber counts.
- Separate gross billings, discounts, refunds, chargebacks, processor fees, VAT collected/payable, settlement cash, eligible net subscription revenue, operating costs, tax estimates and taxable profit.
- The agreed initial policy is a 50% Creator Pool share of eligible net revenue. The remaining 50% must be configured among Nightjar operating pool and Meg & Mike pool; tax reserve is modelled as a separately visible cash reserve/waterfall item, not silently treated as a tax rate or as additional distributable revenue.
- Allocation percentages must reconcile before an effective-dated change can be saved. Show a before/after preview and preserve historical periods.
- The Creator Pool is divided equally between eligible individuals, not by popularity, listens, followers or role count. Each eligible person receives one share per period.
- All money is stored and calculated in integer pence. Any indivisible remainder is allocated deterministically and shown in the reconciliation.
- A closed monthly calculation is immutable. Corrections are separate adjustment entries with an audit reason; no silent rewrite of past payouts.
- Payout states are calculated, reviewed, approved, processing and paid. Paid status requires verified provider reference or an authorised manual payment record.
- Tax reserve movements and actual tax payments are separate ledger entries. Actual payment recording requires date, amount, tax category, period, reference and supporting note. No automatic bank payment is introduced.
- Subscription price changes are effective-dated and distinguish new subscriptions from existing customer billing agreements. Do not change Stripe prices or customer subscriptions merely by editing a planning value.
- Direct creator tips and wallet/token flows remain separate from subscription revenue unless explicitly and legally reconciled into a distinct ledger stream.

### Proposed data shape
- `financePolicies/{policyId}`: effectiveFrom, subscriptionPricePence, creatorPoolPercent, nightjarPoolPercent, ownerPoolPercent, taxReserveRule, currency, version, status.
- `financePeriods/{periodKey}`: sourceTotals, deductions, eligibleNetRevenuePence, policyVersion, creatorPoolPence, allocationTotals, status, closedAt.
- `creatorPayouts/{periodKey_userId}`: periodKey, userId, eligibleRole, poolSharePence, status, paymentReference, timestamps.
- `taxLedger/{entryId}`: category, periodKey, entryType (reserve/estimate/liability/payment/adjustment), amountPence, date, reference, note, createdBy.
- `financeAudit/{eventId}`: actor, action, before/after, reason, timestamp.

## Equal-share allocator
A pure server-side allocator has been added in `functions/src/creator-pool.ts`. It accepts an already-computed pool amount and authoritative eligibility inputs, deduplicates by user ID, requires an active account plus at least one approved role with a completed commitment role, distributes whole pence deterministically and retains the full pool when no one qualifies. It intentionally does not infer revenue, tax or eligibility evidence.

## Tax and accounting guardrails
Tax calculations cannot be represented as a single universal percentage of subscription receipts. Before enabling tax estimates, the owner/accountant must confirm the operating legal entity, accounting period, VAT registration and treatment, payroll/director remuneration, owner distributions and relevant sales jurisdictions. The system will label estimates separately from confirmed liabilities and will not provide automated tax advice or remit funds.

## Live release acceptance
No separate Firebase staging project or hosted PR preview is being used. CI validates the branch without deploying it. After all required checks pass, the owner can approve a controlled production release and test the new workflows in the live Nightjar app. Live financial and identity-provider actions remain separately gated: no real payment, payout, tax remittance, paid identity check or production migration is performed as part of a routine UI release.

Required acceptance evidence:
1. Desktop and Android-width screenshots of all three systems in Midnight Gold.
2. Profile visibility tests proving hidden profile types are absent from public endpoints.
3. Role-approval tests proving a profile type cannot grant a workspace or creator badge.
4. Commitment tests for one qualifying role among several, 99% completion, no assigned rules, exceptions, cancelled work and prospective rule changes.
5. Compensation tests for zero eligible people, one person, multiple roles, rounding remainder, refunds, chargebacks, VAT, processor fees and a closed-period adjustment.
6. Tax ledger tests proving reserve entries are not counted as paid tax and actual payments reconcile independently.
7. Admin/creator permission tests, mobile keyboard/screen-reader checks, loading/empty/error/success states.
8. CI build, typecheck and contract-test evidence. Manual device acceptance remains a separate sign-off.

## Outstanding owner/accountant decisions
- Confirm the legal operating entity and accountant-approved tax categories/rules before tax estimates are enabled.
- Confirm whether the tax reserve is carved out before the 50/remaining allocation split or funded from the Nightjar operating pool. The interface will show both scenarios but cannot silently choose one.
- Confirm whether existing subscribers retain their current Stripe price until they consent/renew, or whether any future price change is intended to apply at renewal under the applicable billing terms.
