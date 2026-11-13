# NightJar Audio — Didit global compliance readiness

**Status:** Not cleared for global launch  
**Last reviewed:** 13 November 2026  
**Scope:** NightJar Audio adult-content access and account verification, including user-submitted material and platform-published material.  
**Purpose:** Engineering and compliance control register. This is not legal advice or a substitute for jurisdiction-specific counsel.

## Executive position

NightJar's stored Didit compliance profile already describes a global adult-content service: persons, no minors, remote onboarding, ongoing relationship, adult content over one-third of activity, 256 country/territory entries and all 50 US states plus DC. The profile is complete; replacing it is unnecessary.

That profile is a statement of intended reach, **not evidence that every country is legally cleared**. The current Didit requirements engine covers a limited set of specific obligations, not every applicable law in all 256 entries. The fresh 13 November workflow check confirms that the live `Free KYC` does not perform age assurance; the separate published `Compliance workflow` passes the engine's listed checks except Germany's session-authentication obligation. However, the engine's pass for France and Italy conflicts with its own requirement list, which specifies a double-anonymous age token while the generated workflow uses `AGE_ESTIMATION`. Treat those passes as unreliable until Didit resolves the discrepancy in writing.

The account-level rule remains mandatory: NightJar grants adult access only after a live, account-bound Didit result containing approved documentary date-of-birth evidence that proves the person is at least 18. The unpublished `Free KYC` draft currently enforces an OCR minimum age of 18 with a decline action and a fail-closed final status branch. Face-search/template matching has been disabled in that draft on both document and liveness captures to reduce unnecessary 1:N biometric processing; document-to-selfie face matching remains a separate check. The draft's age table is keyed to the country that issued the identity document; it does not by itself enforce the user's current jurisdiction. I have also changed the draft so VPN/proxy/Tor detection, an IP/document-country mismatch, or missing IP location routes to manual review rather than silently passing. This does not replace a location-based legal age policy. These draft changes are not live. A generic provider-level `Approved` status, sandbox result, manual approval without age evidence, or age-estimation result without a separately validated adapter must never grant access.

## Live configuration findings

| Control | Observed state | Readiness |
|---|---|---|
| Stored compliance profile | Global scope already recorded | Complete as profile data only |
| Live session workflow | `Free KYC` (workflow `87c1aa80-4d4b-4147-b7e5-a14d8d91788a`), features include OCR, liveness, face match and IP analysis, but Didit confirms age assurance is **false** because OCR age restrictions are not enabled | Blocker |
| Improved `Free KYC` draft | OCR minimum age 18 with decline action and fail-closed final branch; 237 country entries (219 at 18, one at 19, one at 20 and 16 at 21) plus explicit US/Canada subnational exceptions; thresholds apply to document issuing country; no separate IP-country age branch is configured; VPN, IP/document-country mismatch and missing IP-location outcomes now route to manual review in the draft; 1:N face search disabled on document and liveness captures; draft only, not live | Needs sandbox validation; Returned data remains unrestricted (`response_attributes: null`) and must be minimised before publication |
| Separate `Compliance workflow` | Published, includes OCR, liveness, face match, IP analysis, AML, age estimation and NFC; age assurance is true by selfie age estimation; no sessions in last 30 days. Didit's checker reports all listed obligations passing except Germany's post-verification session-authentication control | Not integrated/validated as NightJar's live flow; age estimation alone does not satisfy NightJar's documentary-DOB backend rule |
| Live Didit webhook | Enabled v3 destination `https://nightjar-audio.web.app/api/webhooks/didit`; subscriptions remain `status.updated`, `data.updated`, `user.status.updated` | Destination corrected; signed end-to-end delivery still unverified |
| Actual webhook handler | Firebase rewrite `/api/webhooks/didit` → `diditWebhook` in `europe-west2` | Correct route exists |
| Webhook secret | Didit displays suffix `37Fg`; the Firebase `DIDIT_WEBHOOK_SECRET` suffix was separately confirmed by the owner as `37Fg` | Suffix match confirmed; do not expose or rotate the secret; deployed runtime verification still required |
| Returned data | All three inspected Live workflows (`Free KYC`, `Compliance workflow`, and the improved `Free KYC` draft) have `response_attributes: null`; Didit defines null as all feature outputs returned and stored, including identity fields and media where produced | Production privacy/data-minimisation blocker |
| Public launch | `CLOSED_BETA = true` | Still private testing |

The Didit destination was updated on 13 November 2026 to the Firebase rewrite path after the owner confirmed the Firebase Secret Manager value ends in the same four characters (`37Fg`) shown by Didit. The stale disabled destination was deleted; the active v3 destination and all three event subscriptions were preserved. Didit's historical delivery metrics still show the last success on 8 November, before this URL change, so they do not prove the new route works. A signed test event must still be received by the deployed function, pass raw-body HMAC verification, be safely persisted/queued, and update the correct account before this control is marked complete. The exact-raw-body verification code from PR #361 is merged to `main` as `58d718d4`, but is not deployed yet. PR #362 separately hardens the adult-evidence method check and adds a backend-first release gate; it remains under CI review.

## Regional control matrix

### United Kingdom

- Determine whether each NightJar feature is a Part 3 user-to-user service, a Part 5 publisher of pornography, or both. User-uploaded content and provider-published originals can produce different duties.
- Where the service is in scope, use highly effective age assurance before a child can encounter restricted material. For a dedicated pornography service, Ofcom identifies a blank front gate as the safest placement.
- Ofcom recognises several methods capable of being highly effective at 18, including photo-ID matching, facial age estimation, digital identity, open banking, mobile-network checks, credit-card checks and email-based age estimation. It does **not** universally require facial age estimation or NFC.
- Keep records of methods, placement, effectiveness testing, privacy decisions, complaints and vendor due diligence.
- Assess UK GDPR / DPA 2018 lawful basis and any Article 9 condition if biometric data is processed for identification; complete a DPIA where processing is likely high risk.
- Do not assume NightJar is itself a certified Digital Verification Services provider merely because it consumes Didit.

Official sources:
- [Ofcom — Age assurance duties](https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance)
- [Ofcom — age-gate placement for pornography](https://www.ofcom.org.uk/online-safety/protecting-children/age-checks-why-their-placement-matters-in-pornography)
- [ICO — Special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/)

### Germany

- JMStV §4(2) requires an adult closed-user-group solution for relevant prohibited-to-minors content.
- The control is not just a one-off age check: the service must ensure that only the identified and age-checked person can use the access credential, and make credential sharing harder.
- Didit's requirements engine lists document age verification, video identification and session authentication; it marks session authentication as not covered by Didit. NightJar's account authentication and session controls may contribute, but need a documented threat model and legal review.
- Do not rely on facial age estimation alone unless the exact provider implementation and safeguards are accepted for the applicable KJM criteria.

Official sources:
- [Didit — age checks in apps (document age is checked against the issuing country)](https://help.didit.me/end-users/age-checks-in-apps)
- [KJM — prohibited content and approved age-verification modules](https://www.kjm-online.de/themen/technischer-jugendmedienschutz/unzulaessige-inhalte/)

### France

- SREN and ARCOM's technical reference require an age-assurance solution that meets the French technical standard.
- The double-anonymity design is material: the age-check provider should not learn which adult service is being accessed, and the service should receive proof of age without the user's identifying data.
- Didit's requirements engine lists `age_token_double_anonymity`, but its generated workflow preview substitutes `AGE_ESTIMATION`. These are not interchangeable controls. Obtain written confirmation and evidence from Didit that the proposed product flow meets the current ARCOM standard; otherwise integrate a compatible independent age-token provider or restrict access in France.
- Do not publish the generated graph until this discrepancy is resolved.

Official source:
- [ARCOM — technical reference for online pornography age verification](https://www.arcom.fr/se-documenter/espace-juridique/textes-juridiques/referentiel-technique-sur-la-verification-de-lage-pour-la-protection-des-mineurs-contre-la-pornographie-en-ligne)

### Italy

- AGCOM Delibera 96/25/CONS sets technical and process requirements for sites and video-sharing platforms distributing pornographic images/video to users in Italy.
- The requirements apply to providers established in Italy and outside the EU from 12 November 2025, and to providers established in another EU Member State from 1 February 2026.
- AGCOM describes a double-anonymity age-proof mechanism. A normal OCR + selfie match or a bare facial age-estimation verdict must not be assumed equivalent.
- The Didit engine's `age_token_double_anonymity` obligation conflicts with its generated `AGE_ESTIMATION` branch. Resolve with Didit and Italian counsel before access is enabled.

Official sources:
- [AGCOM — Delibera 96/25/CONS](https://www.agcom.it/provvedimenti/delibera-96-25-cons)
- [AGCOM — implementation and double-anonymity explanation](https://www.agcom.it/competenze/consumatori/interventi-regolamentari-tutela-degli-utenti-finali-attuazione-del-nuovo/tutela-minori-age-verification)
- [AGCOM — EU-established providers effective date](https://www.agcom.it/node/46091/printable/print)

### Ireland

- Coimisiún na Meán's Online Safety Code regulates video-sharing platform services, not every audio-only service by default.
- Determine whether NightJar's video features, embedded clips or other audiovisual functionality bring it within the statutory VSPS definition. The Didit requirements engine's blanket Ireland age-estimation flag is not enough to establish scope.
- Independently assess Irish/EU GDPR, DSA and child-safety duties that apply to the actual service design.

Official sources:
- [Coimisiún na Meán — Online Safety Code and scope](https://www.cnam.ie/industry-and-professionals/online-safety-framework/online-safety-code/)
- [Coimisiún na Meán — age assurance position statement](https://www.cnam.ie/app/uploads/2026/01/Position-Statement-Age-Assurance-and-Online-Safety-Regulation.pdf)

### European Union / EEA

- Apply GDPR principles to every relevant processing activity: lawful basis, transparency, purpose limitation, minimisation, retention, security, data-subject rights and international transfers.
- Biometric data is Article 9 special-category data when processed for uniquely identifying a person. A lawful Article 6 basis alone is insufficient; an Article 9 condition and safeguards are also needed.
- A DPIA is required where processing is likely to result in high risk. Treat large-scale or systematic biometric age-assurance as DPIA-triggering until assessed otherwise.
- Prefer an independent, privacy-preserving proof-of-age token where national rules require or favour it. The Commission's age-verification blueprint is designed to prove an age threshold without disclosing identity to the service; national implementation is still evolving through 2026.
- France and Italy have specific double-anonymity requirements; do not assume one EU-wide workflow satisfies all Member States.

Official sources:
- [GDPR — Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [European Commission — EU age-verification approach](https://digital-strategy.ec.europa.eu/en/policies/eu-age-verification)
- [European Commission — age-verification blueprint](https://digital-strategy.ec.europa.eu/en/factpages/blueprint-age-verification-solution-help-protect-minors-online)

### Australia

- The Age-Restricted Material Codes have staged commencement; relevant requirements for designated internet services and other covered service types took effect from 9 March 2026.
- Where applicable, offer more than one appropriate age-assurance method. eSafety says services should not rely solely on government-issued ID.
- Methods must be technically accurate, robust, reliable and fair, proportionate to risk, accessible and privacy-preserving.
- An ID-only Didit flow is therefore insufficient as the sole method for covered Australian services. Add a tested alternative (for example, an appropriately calibrated age-estimation route or accepted digital identity method) and an accessible fallback. Do not grant access from an unvalidated age-estimation response.
- Complete an Australian privacy impact assessment and vendor due diligence; minimise and destroy age-assurance inputs when their purpose is met.

Official sources:
- [eSafety — adult-content age-assurance FAQ](https://www.esafety.gov.au/industry/codes/faq-access-to-online-porn-and-other-adult-content)
- [OAIC — age-assurance technologies and privacy obligations](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/age-assurance-technologies-and-privacy-obligations)

### United States

- Age-verification duties vary by state, scope and litigation status. Maintain a state-by-state legal register and a geolocation/market-access policy; do not infer current enforceability from a vendor rule alone.
- The Didit engine currently flags Florida, Louisiana, Texas and Utah documentary age checks. Florida is flagged as challenged in the engine. Counsel must confirm current injunctions, amendments, service scope and implementation dates before enabling each state.
- Biometric privacy laws can impose separate notice, consent, retention, disclosure and security duties (including Illinois BIPA and Texas CUBI); California privacy/risk-assessment rules and Washington's consumer-health-data law need separate applicability analysis.
- Do not add facial recognition or face-search features unless necessary, lawful, documented and proportionate. Age estimation and identity verification are not the same as building a persistent face-search database.
- OFAC screening is a sanctions control for transactions and persons within relevant US jurisdiction. Its 50 Percent Rule is not a blanket rule that every user worldwide must undergo invasive KYC. Map the actual US nexus and also assess UK and EU sanctions independently.

Official sources:
- [Florida HB 3](https://www.flsenate.gov/Session/Bill/2024/3)
- [Louisiana Act 440](https://legis.la.gov/legis/BillInfo.aspx?s=22RS&b=HB142)
- [Texas HB 1181](https://capitol.texas.gov/BillLookup/History.aspx?LegSess=88R&Bill=HB1181)
- [Utah SB 287](https://le.utah.gov/~2023/bills/static/SB0287.html)
- [OFAC — sanctions list service](https://ofac.treasury.gov/sanctions-list-service)
- [OFAC — 50 Percent Rule](https://ofac.treasury.gov/faqs/topic/1521)
- [Illinois BIPA](https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=3004)
- [Texas CUBI](https://statutes.capitol.texas.gov/Docs/BC/htm/BC.503.htm)
- [California Privacy Protection Agency — regulations](https://cppa.ca.gov/regulations/ccpa_updates.html)

### Brazil

- LGPD treats biometric data linked to a natural person as sensitive personal data.
- Identify and document a valid Article 11 legal basis, necessity, purpose, transparency, security and data-subject rights before enabling biometric processing.
- Do not assume face match + liveness alone makes the workflow compliant. Review whether the biometric processing is necessary and whether a less intrusive age-assurance method is available.

Official source:
- [Brazil LGPD — Law 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)

## Cross-border controls still required

1. **Country coverage register:** Map each intended market to applicable content classification, minimum age, age-assurance method, gate placement, retention, local representative/registration, complaint process and sanctions requirements. The Didit profile's 256 entries are not a completed legal inventory.
2. **Jurisdiction routing:** Didit's own age-check guidance states that document age restrictions are evaluated against the country that issued the document. The current draft has IP Analysis available, but `is_ip_geofencing_enabled` is false and there is no conditional branch that applies the user's IP country to a local minimum-age policy. Do not route only by document issuing country. Use a documented combination of reliable user-location signals, declared residence, service targeting and account context. Treat VPN/proxy conflicts and uncertain location as review or restricted access, not silent pass.
3. **Alternative methods:** Document at least one accessible alternative to document upload where required; test age-estimation thresholds, bias, false acceptance and false rejection before relying on it.
4. **Sanctions:** Build a separate risk-based screening policy for creators, payees, counterparties and transactions, covering UK, EU, US and other applicable lists, ownership/control, ongoing monitoring, alert handling and documented false-positive resolution. Do not treat IP geolocation as sanctions screening.
5. **Data minimisation:** Configure Didit's Returned data per feature. All inspected workflows currently have `response_attributes: null`, meaning all feature outputs are stored and returned. In the documentary age workflow, retain only the approved decision and DOB required by Nightjar's server-side age calculation; remove document images, portrait images, names, document numbers, address, MRZ, nationality and other unnecessary identity fields. Disable selfie/liveness media and unnecessary scores in LIVENESS/FACE_MATCH; for IP Analysis retain only the minimum country/risk signals required by the documented policy, not raw IP/device details. This must be configured in each feature's Returned data tab in the Didit console; the available Didit integration actions do not expose that control.
6. **Retention and deletion:** Configure short, justified session retention; document deletion and data-subject request processes; check backup, cache and subprocessor retention.
7. **Vendor due diligence:** Obtain the current DPA, subprocessor list, international transfer mechanism, data residency, security certifications and independent testing evidence. Confirm model-training opt-out and biometric deletion commitments in the contract, not just marketing copy.
8. **Operational governance:** Establish an age-assurance DPIA, records of processing, privacy notices, just-in-time notices, complaints/appeals, accessibility testing, manual review controls, vendor monitoring and a documented incident/breach process.

## Technical acceptance criteria

- [ ] Live workflow performs a supported 18+ check for every account before adult access.
- [ ] Country/state routing is based on the user's relevant jurisdiction, not only document issuer.
- [ ] France and Italy have a verified double-anonymity proof-of-age route or are restricted.
- [ ] Germany has closed-user-group authentication and credential-sharing protections or is restricted.
- [ ] Australia offers multiple appropriate methods and is not ID-only.
- [ ] UK front gate is in place where required; age assurance is HEAA-tested.
- [ ] US state-by-state applicability and injunction register is approved by counsel.
- [ ] Brazil biometric legal basis and safeguards are documented, or biometric processing is disabled there.
- [ ] Sanctions screening is implemented for the appropriate parties and transactions, with alert workflow and ongoing monitoring.
- [ ] Returned data, retention, model-training settings and deletion controls are minimised and verified.
- [ ] Live webhook points to `https://nightjar-audio.web.app/api/webhooks/didit`, the deployed secret matches the provider endpoint secret, and signed test events are received, verified, queued and processed.
- [ ] Sandbox tests cover pass, under-18, borderline, poor capture, spoof/injection, duplicate, VPN/proxy, provider timeout, duplicate webhook, stale webhook, wrong account, wrong workflow and superseded session.
- [ ] The backend grants access only from a current live session bound to the same account/application/workflow with independently validated adult evidence.
- [ ] Accessibility and appeal routes are tested; users are not trapped by a single failed method.
- [ ] Legal counsel signs off each launch market and content classification.
- [ ] Public-launch gates are separately approved; do not turn off the closed beta or deploy the workflow as part of this compliance remediation.

## Immediate next actions

1. Merge PR #361 only after its green CI is confirmed against the latest head; deploy the backend change through the normal controlled release path, not from the PR.
2. Run a signed Didit test delivery against `/api/webhooks/didit`; verify raw-body HMAC, idempotency, persistence/queueing and account-bound processing in Firebase logs/data.
3. Review and harden the unpublished `Free KYC` draft (18+ document-age restriction, fail-closed branches, anti-spoof settings, data minimisation and retention); run sandbox pass/under-18/review/attack tests before considering publication.
4. Ask Didit for written answers on France/Italy double anonymity, Germany closed-user-group/session authentication, Australia alternative methods, age-estimation response fields and thresholds, data residency/retention and exact regional certification evidence.
5. Configure Returned data to the minimum required fields in the Didit Console; current `response_attributes: null` means all feature outputs are returned. Confirm retention, face-search/template controls and model-training terms.
6. Implement NightJar-side session authentication/credential-sharing controls for Germany, or restrict Germany until validated.
7. Complete the country-by-country legal inventory and obtain qualified counsel sign-off before enabling any additional market.

**No workflow publication, public launch or relaxation of the 18+ gate is authorised by this register. The live webhook destination correction described above has already been approved and applied; it is not evidence of a successful signed delivery.**
