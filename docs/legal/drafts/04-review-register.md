# NIGHTJAR CONTRACT FRAMEWORK — REVIEW REGISTER

**Internal working document — not part of any contract**

## Current status

The repository contains general platform Terms of Use, a Privacy Notice framework, Age Assurance Notice and Professional & Content Terms. The existing Professional & Content Terms state that creators retain rights by default and that significant commercial rights transactions need separate written terms. They are not a complete creator commercial contract.

This draft pack proposes a modular Master Contributor Agreement with schedules. It is not legal certification and must not be used as live terms until all completion items are resolved.

## Must resolve before anyone signs

1. **Contracting party:** confirm whether NightJar is operated by an individual, partnership, limited company or other entity. Insert exact legal name, legal form and service address. A brand name alone is insufficient.
2. **Founders' structure:** Meg and Mike's current 50/50 arrangement needs review. An informal business relationship can create partnership obligations and personal liability. Decide whether to obtain advice on partnership or incorporation before signing creator agreements.
3. **Execution authority:** confirm who can sign for the Operator and their authority.
4. **Employment/worker status:** review actual working arrangements for recurring creator roles. Do not rely on a self-employed label.
5. **Creator Pool eligibility table:** agree role-specific qualifying work, commitment count, duration where relevant, qualification/cut-off dates, review process and short-form/mini-work treatment.
6. **Creator Pool policy:** confirm 50% of Eligible Net Subscription Revenue, permitted deductions, payment date, equal individual share, founder opt-out, carry-forward of unallocated funds and prospective change process.
7. **Owner payments:** keep owner distributions separate from creator entitlements. Confirm owner pay/drawings under the final legal structure and tax advice.
8. **Commission terms:** confirm pricing, payment milestones, revision limits, acceptance criteria, VAT wording, cancellation rules and assignment after full payment.
9. **Rights chain:** ensure every writer, performer, editor, artist, composer, sample and third-party asset has a signed assignment, licence or consent appropriate to intended use.
10. **Moral and performer rights:** determine which consents or waivers are needed for each type of work. Do not assume they transfer with copyright.
11. **NightJar Originals:** define exclusivity duration, territory, media, release commitment, fee, non-release long-stop, termination/reversion and existing subscriber wind-down.
12. **Data roles:** determine when contributors are independent controllers, joint controllers or processors. Complete a processor addendum only for actual processor activities.
13. **Transcription provider:** identify exact speech-to-text service, settings, retention, data location and contractual no-training terms before asking creators to sign Schedule G.
14. **Removal workflow:** align the 14-day voluntary-work removal target with active subscriber access, legal holds, backups, rights disputes and actual deletion capability.
15. **Tax and VAT:** have an accountant confirm VAT treatment of subscriptions, creator payments and founder payments.
16. **Consumer terms:** review listener subscription terms against the Digital Markets, Competition and Consumers Act 2024 and the Consumer Subscription Contracts (Cancellation and Information) Regulations 2026 where applicable. Creator contracts do not solve consumer subscription compliance.
17. **Privacy and age assurance:** complete existing documents with legal operator, contact details, lawful bases, retention periods, processors and international transfer information.
18. **Insurance and liability:** consider public liability, professional indemnity, cyber and media liability cover as NightJar grows. Insurance does not replace sound contract terms.

## Repository observations

- src/legal/nightjarLegal.ts contains platform Terms, Privacy Notice, Age Assurance Notice and Professional & Content Terms.
- The current Professional & Content Terms state creators retain rights by default, use a limited platform licence and require separate written terms for significant commercial rights transactions.
- The live Compensation Control Centre currently records revenue settlements using a Stripe provider label. This conflicts with the current operating instruction that NightJar uses Monzo bank transfers, not Stripe. Correct the live finance system separately; this draft pack does not change production code.
- The live Creator Pool allocator currently gives remainder pennies in sorted account-ID order. A fair rotating or neutral remainder method should be implemented and tested separately.
- The finance engine has a configurable tax reserve. Contract wording must not imply that a reserve is itself a tax payment or that the Operator can deduct taxes on its own profits from the Creator Pool.

## Legal research checkpoints

- Copyright assignment: Copyright, Designs and Patents Act 1988, section 90 requires an assignment to be in writing and signed by or on behalf of the assignor. Future copyright and performer rights need careful treatment.
- Employment status: UK government guidance says status depends on the reality of the relationship, not merely the contract label.
- Data processing: where a processor acts for a controller, UK GDPR requires a written contract with specified terms.
- Subscription contracts: current 2026 guidance exists for the DMCCA 2024 subscription rules and the Consumer Subscription Contracts (Cancellation and Information) Regulations 2026.

## Sources for internal audit

- Copyright, Designs and Patents Act 1988, section 90: https://www.legislation.gov.uk/ukpga/1988/48/section/90
- GOV.UK employment status guidance: https://www.gov.uk/government/publications/employment-status-and-employment-rights/employment-status-and-employment-rights-guidance-for-hr-professionals-legal-professionals-and-other-groups
- ICO controller-processor contracts: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/contracts
- GOV.UK subscription contracts guidance (published 19 October 2026): https://www.gov.uk/government/publications/subscription-contracts

## Decision log

| Decision | Status | Notes |
|---|---|---|
| Master Agreement structure | Proposed | Modular master plus schedules |
| Voluntary work ownership | Proposed | Creator retains ownership; limited platform licence |
| Paid commissioned work | Proposed | Written assignment after full payment |
| Creator Pool share | Proposed | 50% of Eligible Net Subscription Revenue |
| Creator Pool distribution | Proposed | Equal share per eligible person; one share per person |
| Meg opts out of Creator Pool | Proposed | Owner compensation remains separate |
| Direct creator payments | Confirmed operating principle | NightJar does not intermediate creator-to-creator money |
| NightJar Originals | Needs commercial detail | Separate express signed opt-in |
| Speech-to-text only | Proposed | No AI training or voice cloning |
| Governing law | Proposed | England and Wales |
