# Nightjar — Didit six-month verification-evidence retention

**Owner selection:** 14 October 2026. The owner selected **6 months** in Didit **App Settings → Data retention**. The screenshot shows that option checked. **Persistence has not been independently verified**: close the menu, allow any Save/Apply action, revisit the setting and confirm the selected value stays at **6 months** for the **Nightjar live application**.

## Scope, purpose and limits

- The configured policy should keep Didit's verification-session evidence for **six calendar months**, including previous and future sessions for that application. This is the actual available Didit UI option, not the previous unattainable 90-day preference.
- Nightjar retains a **separate minimum-necessary adult-status record** bound to the authenticated user ID. It includes the signed provider outcome, session reference, status and timestamps; not identity-document images or raw biometric media.
- After Didit deletes old verification sessions, valid previously approved users **continue to access Nightjar without paying for another age check**. Legitimate revocation, fraud or legally justified reviews are exceptions to the normal verify-once policy.
- The six-month selection **does not imply that all information held by Didit is deleted at six months**. Didit documents separate API audit logs kept for **365 days**, and some provider blocklist data, optional duplicate-detection templates or lawful holds may be governed by separate arrangements. Review the actual live workflow and applicable DPA. Do not over-promise blanket deletion.
- The user-facing legal notice describes the selected **six months** while recording that final provider configuration has to be confirmed before live use.

## Live Didit console — required owner actions

1. Sign in to <https://business.didit.me/> and select the **Nightjar LIVE application**, not Sandbox.
2. Open **App Settings → Data retention** and confirm **6 months** is selected. Close the dropdown; save/apply if prompted. Navigate away, return to the page and re-check that the saved selection remains **6 months**.
3. Record non-sensitive configuration evidence internally: Nightjar application name, whether live or sandbox, exact displayed retention choice, confirmation date and person confirming. Avoid including user identity documents in evidence screenshots.
4. Review the age-verification workflow for optional separately retained biometrics, duplicate-face detection, blacklists and ID return fields. Use the minimum data needed for the age gate.
5. In **Settings → Account → Privacy and data use**, switch **off** `Allow Didit to use my organization's verification data to improve models` and confirm the **Opted out** state. This organisation-wide choice is distinct from data-retention settings.
6. Obtain or review Didit's DPA, processor and international-transfer arrangements and establish Nightjar's own data-controller retention and erasure procedures, with UK legal/data-protection input.
7. Verify signed production webhooks, real adult approval, underage rejection, resumed unfinished checks and cross-device login reuse. Do not deploy a mandatory live gate before these work.
8. Confirm no automated job inadvertently expires Nightjar's approved 18+ entitlement when Didit purges evidence after six months. Document exceptions for genuine revocation or security review.

## Evidence status

- **Selected in the Didit console:** six months (owner-provided screenshot on 14 October 2026).
- **Saved/persisted on the live application:** pending confirmation by re-opening the setting.
- **Organisation-wide model-improvement opt-out:** pending confirmation.
- **Separate provider audit / template retention:** pending compliance review.
- **Live production 18+ workflow and webhook readiness:** must be tested before enforcing the gate.

Nightjar's GitHub files and admin Didit dashboard cannot change Didit's external settings. They must not assert an external configuration is complete solely because code or documentation says so.

Provider sources:
- <https://help.didit.me/data-privacy/how-didit-protects-data>
- <https://help.didit.me/data-privacy/delete-verification-data>
- <https://help.didit.me/data-privacy/opt-out-of-model-training>
