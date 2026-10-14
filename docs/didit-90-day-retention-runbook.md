# Nightjar — Didit 90-day evidence-retention runbook

**Status (14 October 2026): NOT CONFIRMED IN DIDIT.** This is the operator's configuration procedure; committing it to GitHub does not change the external Didit console.

## Policy scope

- Target: **90 days for Didit's ordinary identity-verification session evidence**, per Nightjar's *live application*. Do **not** confuse `3 calendar months` with an exact 90-day TTL unless Didit confirms its interpretation.
- Nightjar's own separate, minimum-necessary `ageAssurance/<firebase_uid>` record of a passed 18+ check remains valid for the account's permitted lifetime. Deleting provider images after 90 days must never automatically require a new paid check.
- Provider/API audit logs, backups, separate biometric templates or legal preservation holds may follow other authorised schedules. Document exceptions accurately: do not tell people **all** information is deleted after 90 days.
- Risk: Didit's general retention defaults to **unlimited**, and changing app-specific retention affects existing sessions as well as new sessions.

## Owner checklist (complete in the live console)

1. Sign in to <https://business.didit.me/>.
2. Select the **Nightjar LIVE application**, not the sandbox environment. Confirm the displayed application and workflow.
3. Navigate to **App Settings → Data retention**.
4. Set the verification-data retention to **90 days**, when exact days are accepted. Where a UI offers only **3 months**, clarify whether it is an exact 90-day duration; record the answer.
5. Save and return to the same page to confirm the persisted value. Capture the non-personal settings confirmation and date for the restricted compliance record. Do not screenshot users' identity records.
6. Review additional options: **retained biometric template / duplicate-face detection**. If an independent template is retained, either disable it or configure a justified and finite retention period with its own disclosure and compliance basis.
7. Open **Settings → Account → Privacy and data use** at the organisation level and turn **off** *Allow Didit to use my organization's verification data to improve models*. Confirm the **Opted out** state. This is an independent organisation-wide setting and does not change retention.
8. Review the DPA, subprocessor and transfer terms, security documentation, and applicable law with the Nightjar data controller and legal adviser.
9. Run a controlled **live** adult approval and declined/underage check after webhooks and age workflow have been configured. Confirm successful account-level approval persists after logout/login without a second provider request.
10. Verify the 90-day setting by inspecting Didit's effective retention policy, not by automatically deleting live users as a “test.” Maintain an evidence log: application name, setting as displayed, date, who checked it, policy version, separate training state, and outstanding exceptions.

## Operating constraints

Nightjar's client and admin hub cannot directly alter Didit's external application settings. Do **not** add a purported “90 days configured” status or public promise just because this runbook exists. Owner evidence in Didit must be confirmed first. A manual verification-session deletion is irreversible and may also delete provider evidence required for investigation. The 90-day retention window affects session evidence, **not** automatic Nightjar approval expiry.

Provider references:
- <https://help.didit.me/data-privacy/delete-verification-data>
- <https://help.didit.me/data-privacy/opt-out-of-model-training>
- <https://help.didit.me/account-organization/organizations-and-applications>
- <https://updates.didit.me/terms/business/>
