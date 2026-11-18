# NIGHTJAR CONTRACT FRAMEWORK — REVIEW REGISTER

**Internal working document — not part of any contract**

## Current status

The repository contains general platform Terms of Use, a Privacy Notice framework, Age Assurance Notice and Professional & Content Terms. The existing Professional & Content Terms state that creators retain rights by default and that significant commercial rights transactions need separate written terms. They are not a complete creator commercial contract.

This pack now proposes a modular Master Contributor Agreement, schedules, separate performer and moral-rights instruments, role-specific scopes, signing protocol and plain-English glossary. It is a substantially developed founder-review draft, not legal certification and not approved for signature.

## Contract pack

1. Master Contributor Agreement.
2. Schedule A — Voluntary Contributions.
3. Schedule B — Paid Commissioned Work and Statement of Work.
4. Schedule C — Creator Pool and Revenue Share.
5. Schedule D — Confidentiality and conditional Data Processing Addendum.
6. Schedule E — NightJar Originals.
7. Schedule F — standalone direct creator-to-creator collaboration agreement (not part of the Master).
8. Schedule G — optional speech-to-text permission.
9. Schedule H — separate work-specific Performer Consent, Recording and Use Release.
10. Schedule I — separate, limited Moral Rights Consent or Waiver.
11. Role-specific scopes — VA Creator, Writer, Audio Editor, Artist and combined roles.
12. Execution and signing protocol.
13. Plain-English glossary.

## Critical matters before signature

These are not drafting placeholders that can safely be guessed. Meg and Mike must resolve them before anyone signs.

1. **Legal operator and founders' structure.** Confirm whether NightJar is operated by an individual, ordinary partnership, limited company or other entity. Insert the exact legal name, legal form and address. The Partnership Act 1890 defines partnership by the relationship of people carrying on business in common with a view to profit; GOV.UK explains that ordinary partners personally share responsibility for business losses and bills. Meg and Mike's actual arrangements need advice; a 50/50 description alone does not settle the legal classification. No contract may describe NightJar as a limited company unless it has been incorporated.
2. **Execution authority.** Confirm who may sign for the Operator and whether one or both founders must approve higher-risk rights transactions.
3. **Employment/worker status.** Review the real relationship for each regular creator role. Current GOV.UK guidance is clear that status depends on the facts, not merely the contract label. If NightJar sets fixed hours, requires personal service, controls methods, guarantees work or otherwise creates dependency, seek advice before relying on self-employment wording.
4. **Creator Pool eligibility.** Complete the role-specific eligibility table before enabling a creator to rely on it. Agree minimum commitments, whether main pieces have a minimum duration, how artwork/editing are measured, short-form exceptions, qualification dates, quality/release criteria, appeals and the date an entitlement accrues. Do not make a universal audio-duration rule for non-audio roles.
5. **Unallocated Creator Pool and closure.** The current draft carries unallocated monthly pool funds forward and prevents transfer to owners. Meg and Mike must agree how any accumulated unallocated balance is treated if NightJar permanently closes or stops operating. This cannot be left blank at signature.
6. **Creator Pool administration and tax.** Confirm the proposed statement deadline (20 days after month end), payout deadline (30 days after month end), carry-forward treatment if no creators qualify, and closure treatment for accumulated unallocated funds. Obtain accountant confirmation on VAT treatment of subscriptions, whether VAT is payable on the £6.99 price, creator tax/payment reporting, PAYE/NI issues and founder drawings. The 50% pool formula must use properly calculated eligible net receipts; NightJar's own profit tax or owner withdrawals must not be deducted from the Creator Pool.
7. **Commission pricing.** Agree standard or project-specific fees, deposits/milestones, review and revision limits, cancellation amounts, VAT wording, source-file delivery and the payment trigger for rights transfer.
8. **Rights ownership chain.** For every release, identify the script author(s), sound-recording producer/owner, performer(s), editor, artist, composer, sample owners and third-party asset owners. Each person may grant only rights they hold. A producer's copyright in a sound recording, the author's copyright in a script and a performer's property rights are distinct.
9. **Performer release and safeguarding.** Complete Schedule H for every identifiable performer before recording/use. Confirm all performers are adults, verify age/identity through the secure NightJar process, document the actual performance and boundaries, credit/anonymity choice, fee, rights option and approved uses. Check the process against NightJar's actual content categories and safety workflow. Do not use the contract alone as proof that verification took place.
10. **Moral rights.** Use Schedule I only where needed. Moral rights are not assignable; a waiver must be in a signed written instrument. Decide when a limited consent is enough and when a narrowly specified waiver is necessary. Never put a blanket waiver into the Master.
11. **NightJar Originals.** Decide exclusivity duration, territory, media, sublicensing, edits, creator portfolio use, fee, release commitment, long-stop date, non-release remedy, termination/reversion, rights after NightJar closure and any paid listener wind-down. Schedule E must not be left incomplete.
12. **Data roles and processor contracts.** Assess whether a contributor is a controller, joint controller or processor for each activity. Complete Schedule D Part B only for actual processor work. Check all Article 28 requirements, including sub-processors, international transfers, security, assistance, audits and return/deletion.
13. **Transcription provider.** Identify the exact speech-to-text supplier, configuration, terms, sub-processors, data location, source-audio retention and written no-training/model-improvement position. If the required protections cannot be verified, do not submit creator audio to that supplier under Schedule G.
14. **Data protection complaints.** The Data (Use and Access) Act 2025 reforms include a requirement for organisations to operate a data-protection complaints process. Current regulator guidance says complaints must be acknowledged within 30 days and handled without undue delay. NightJar's Privacy Notice and internal support process must be updated and tested. The contract pack's confidentiality process is not a substitute for a statutory data-protection complaint route.
15. **Regulator name.** The office of the Information Commissioner was abolished and its functions transferred to the Information Commission from 30 September 2026. Update any old “ICO”/“Information Commissioner” references in public documents and internal procedures as appropriate, taking account of the statutory transition.
16. **Listener subscription rules.** The Digital Markets, Competition and Consumers Act 2024 subscription chapter and the Consumer Subscription Contracts Regulations require a separate launch review. The 2026 Regulations are shown on legislation.gov.uk as draft legislation laid in October 2026, with a stated proposed commencement of 1 January 2027; recheck the final made instrument and commencement status before launch. Do not treat the draft as already enacted.
17. **Removal workflow.** Align the 14-day voluntary-work removal target with paid listener access, rights disputes, legal holds, backups and the actual deletion process. A removal request must not be delayed indefinitely.
18. **Liability cap and insurance.** The proposed cap (greater of £1,000 or relevant amounts paid/payable during the preceding 12 months) is a balanced drafting proposal, not a guaranteed enforceable amount. Review it against likely loss, contributor vulnerability, contract value and the Unfair Contract Terms Act 1977 reasonableness requirement where applicable. Consider cyber, media, professional indemnity and public liability cover.
19. **Signature evidence.** Use the separate signing protocol. Retain the exact signed document, version, signatory identity, timestamp and authentication evidence. A generic platform terms checkbox must not be assumed to execute a copyright/performer assignment or moral-rights waiver.
20. **Existing platform legal documents.** Reconcile the Master and schedules with src/legal/nightjarLegal.ts. In particular, ensure the Professional & Content Terms' platform licence, public promotional uses, confidentiality rules, removal processes and no-AI-training wording do not contradict the new creator contracts. The app's legal acceptance system currently covers platform Terms, Privacy Notice and Professional Terms only; schedules and rights instruments need a separate execution/record workflow before they are used.

## Repository audit findings

- src/legal/nightjarLegal.ts currently contains platform Terms, Privacy Notice, Age Assurance Notice and Professional & Content Terms. The Professional & Content Terms are explicitly a private-beta framework and defer commercial creator rights to separate agreements.
- src/components/LegalAgreementPanel.tsx records acceptance of the current legal documents, but does not itself create the work-specific signed SOW, copyright/performer assignment or moral-rights waiver needed by this pack.
- src/components/CompensationControlCentre.tsx currently hardcodes a Stripe provider label when recording revenue settlements. This appears to describe the source of incoming subscription settlement data, not necessarily the method used to pay creators. The confirmed creator payout route is direct bank transfer using Monzo. Verify the actual subscription collection route before changing the finance UI; do not add invented card-processing fees or provider assumptions to creator contracts. No production code has been changed in this contract PR.
- The live Creator Pool allocator in functions/src/creator-pool.ts sorts account IDs and assigns remainder pennies to the first account(s). That can systematically favour the same contributors. A fair rotating or neutral remainder method should be implemented and tested separately.
- The finance engine permits a configurable tax reserve. A reserve is not itself a tax payment and must not be deducted from Creator Pool funds unless there is a clear lawful and expressly agreed basis.
- The actual Creator Pool commitment thresholds are still configurable/subject to founder decision. The signed eligibility table must be tied to the exact policy version and the live backend calculation.

## Legal research checkpoints (checked 8 November 2026)

- Copyright assignment: Copyright, Designs and Patents Act 1988, section 90(3) requires an assignment to be in writing and signed by or on behalf of the assignor. Section 91 addresses prospective ownership of future copyright.
- Performer rights: section 182 protects against recording certain qualifying performances without consent; section 191B(3) requires an assignment of a performer's property rights to be in writing and signed by or on behalf of the assignor.
- Moral rights: section 94 says moral rights are not assignable; section 87 permits signed written waivers. The scope should be specific.
- Employment status: current GOV.UK guidance and engager checklist say status follows the reality of the relationship, not the contract label.
- Data processing: UK GDPR Article 28 requires specified contractual terms where a processor acts for a controller. The Information Commission's current guidance describes the required terms.
- Data protection complaints: current regulator guidance states organisations need a complaint process, acknowledgement within 30 days and a response without undue delay.
- Founders' business structure: Partnership Act 1890, section 1 and GOV.UK partnership guidance should be considered before selecting the Operator.
- E-signatures: the Law Commission says an electronic signature can execute a document if the signer intends to authenticate it and all formalities are satisfied. Use an evidence-preserving signature method for rights instruments.
- Consumer subscriptions: DMCCA 2024 and the draft Consumer Subscription Contracts Regulations 2026 require a separate forward-looking review before launch.

## Primary sources for the audit

- CDPA 1988, s.90 assignment and licences: https://www.legislation.gov.uk/ukpga/1988/48/section/90
- CDPA 1988, s.91 future copyright: https://www.legislation.gov.uk/ukpga/1988/48/section/91
- CDPA 1988, s.182 performer consent: https://www.legislation.gov.uk/ukpga/1988/48/section/182
- CDPA 1988, s.191B performer property rights assignment: https://www.legislation.gov.uk/ukpga/1988/48/section/191B
- CDPA 1988, ss.87 and 94 moral rights: https://www.legislation.gov.uk/ukpga/1988/48/section/87 and https://www.legislation.gov.uk/ukpga/1988/48/section/94
- GOV.UK employment status guidance: https://www.gov.uk/government/publications/employment-status-and-employment-rights/employment-status-and-employment-rights-guidance-for-hr-professionals-legal-professionals-and-other-groups
- Information Commission controller-processor contract guidance: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/
- Data protection complaints guidance: https://ico.org.uk/for-organisations/how-to-deal-with-data-protection-complaints/
- Partnership Act 1890, s.1: https://www.legislation.gov.uk/ukpga/Vict/53-54/39/section/1
- GOV.UK ordinary partnership guidance: https://www.gov.uk/set-up-business-partnership
- Law Commission electronic execution: https://lawcom.gov.uk/project/electronic-execution-of-documents/
- Unfair Contract Terms Act 1977: https://www.legislation.gov.uk/ukpga/1977/50/section/2
- DMCCA 2024 subscription contracts guidance: https://www.gov.uk/government/publications/subscription-contracts
- Draft Consumer Subscription Contracts Regulations 2026: https://www.legislation.gov.uk/ukdsi/2026/9780348287912/data.htm

## Founder decisions

| Decision | Current draft position | Founder status |
|---|---|---|
| Master Agreement structure | Master plus schedules; standalone collaboration and separate rights instruments | Review |
| Voluntary work ownership | Creator retains ownership; limited, non-exclusive platform licence | Review |
| Paid commissioned work | Signed, work-specific assignment after full payment | Review |
| Creator Pool | 50% of Eligible Net Subscription Revenue | Review |
| Creator Pool split | Equal individual share per eligible person; one share regardless of roles | Review |
| Meg opts out of Creator Pool | No Meg share; pool divided among other eligible creators | Review |
| Unallocated pool | Carry forward; never transfer to owners/operating pool | Review closure treatment |
| Direct creator payments | NightJar does not intermediate; creators pay one another directly | Confirmed operating principle |
| NightJar Originals | Separate, express and work-specific exclusivity | Review commercial terms |
| Performer consent | Separate work-specific release for every performer | Review |
| Moral rights | No blanket waiver; use narrow separate instrument if needed | Review |
| Speech-to-text | Optional and transcription-only; no training/voice cloning | Review provider |
| Payment route | Direct bank transfer from Monzo (subject to account change notice) | Confirmed operating principle |
| Governing law | England and Wales | Review |
