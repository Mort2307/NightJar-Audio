# Nightjar: Profile Types, Commitments and Compensation Centre
Date: 4 November 2026
Status: implementation plan and acceptance contract; not a production policy change.

## Delivery boundary
All work is being developed on `feat/profile-commitments-compensation-centre`. No merge, Firebase deployment, Stripe configuration change, live price change, payout, tax remittance or migration is authorised by this document. The owner receives a working preview and reviewable change set before any production release.


## Current implementation status — 4 November 2026

This section distinguishes implemented code from planned production behaviour. A green CI run does not mean these systems are fully integrated.

| Area | Implemented in this branch | Still required before production |
|---|---|---|
| Profile types | Allowlisted profile metadata contract and isolated preview | Authenticated read/write callables, account-owned persistence, validation, public-profile projection, visibility leak tests and profile editor integration |
| Commitments | Pure role-completion evaluator and tests | Versioned template/assignment storage, admin configuration, member task UI, evidence submission/review, exception audit trail, period locking and server-side eligibility calculation |
| Compensation | Integer-pence equal-share allocator and tests | Authoritative settlement/revenue inputs, refund/chargeback/fee/VAT reconciliation, monthly close, immutable payout ledger, manual payment reconciliation, tax ledger, admin settings and migration strategy |
| Experience | Midnight Gold interactive preview in Admin Finance Lab | Full member/admin journeys, loading/error/empty states, keyboard/screen-reader checks and Android-width acceptance |
| Security | Existing account/role callable architecture remains the authority | New callable permission tests, public visibility enforcement and security review of every new write path |

### Non-negotiable integration boundaries

- A profile type is presentation metadata. It must never be used as proof of an approved role.
- An approved professional role comes from the existing account approval state, not a profile document, selected tab, role label or user-supplied payload.
- Commitment eligibility must be calculated on the server from immutable, period-scoped assignments and reviewed evidence. The client may display progress but cannot mark itself eligible.
- The allocator receives a server-derived eligible-user set and an already-reconciled Creator Pool amount. It must never accept a client-calculated revenue or pool figure.
- Finance Lab scenarios are not ledger entries. Preview and simulation mode must remain visibly separate from live finance.
- A tax reserve is a cash-management entry, not a tax rate, tax liability or payment. The legal entity, VAT treatment and tax rules are not yet confirmed.
- Meg and Mike's 50/50 ownership is not a mandate to distribute 50% of monthly receipts to the owners. Owner distributions must be a separate, effective-dated policy and subject to cash, tax and legal constraints.
- No live Stripe price, customer billing agreement, payout, bank payment, production Firestore record or production deployment is changed by this branch.

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

## Release sequence

1. **Foundation and contracts:** finalise schemas, callable request/response contracts, role allowlists, period keys, audit event shape and migration/backfill rules.
2. **Profile system:** implement callable persistence and server-filtered public projections; connect the existing profile studio without duplicating identity or role approvals.
3. **Commitment system:** implement template/version administration, assignment lifecycle, evidence/review and server eligibility calculation; test cancelled work and Nightjar-caused blockers.
4. **Compensation system:** verify payment-provider data lineage; implement reconciliation and immutable period ledger; connect allocator only after eligibility and revenue are server-derived.
5. **Experience and QA:** connect member/admin screens, accessibility, responsive layouts, empty/error/loading states, emulator tests and preview screenshots.
6. **Migration and release:** dry-run migration, compare old/new outputs without paying anyone, obtain owner/accountant decisions, user acceptance, staged rollout and rollback plan.

## Findings from the current main branch
- Nightjar already has a multi-professional-role account model. `myProfessionalRoles`, `submitProfessionalApplication` and admin role management govern approval and workspace access.
- `UserProfileStudio` and `RoleProfileExtension` already render shared identity and role-specific profile fields. The new profile-type layer must extend this model rather than duplicate identity or weaken professional approvals.
- Existing commercial settings are stored in `settings/commercial`, with callable endpoints `commercialOverview`, `saveCommercialSettings` and `creatorCompensationStatus`.
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

## Preview and release acceptance
The preview must run against fictional or explicitly redacted test data and must not read or mutate live customer financial records. The live admin view may show actual data only after backend authorisation and data-source verification. Preview actions must be inert or operate only on an isolated test dataset.

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
