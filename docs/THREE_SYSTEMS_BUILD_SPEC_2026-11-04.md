# Nightjar: Profile Types, Commitments and Compensation Centre
Date: 4 November 2026
Status: implementation plan and acceptance contract; not a production policy change.

## Delivery boundary
All work is being developed on `feat/profile-commitments-compensation-centre`. No merge, Firebase deployment, Stripe configuration change, live price change, payout, tax remittance or migration is authorised by this document. The owner receives a working preview and reviewable change set before any production release.

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
