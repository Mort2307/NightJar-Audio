# NightJar — user-reported live smoke observations (20 October 2026)

This is a record of **what the tester reported**, not an independently reviewed device trace and not formal PASS for wider acceptance scenarios. Tester was not asked to share personally identifying information. Exact platform/browser and deployed build were not provided; do not assume Android, APK or desktop merely because a user reported a real-device test.

| ID | User-reported observation | Evidence classification | Supports, but does not complete |
| --- | --- | --- | --- |
| QA-R1 | An already-verified member signs out, signs back in and still displays approved verification | **USER-REPORTED PASS (limited)** | D3 session persistence; not cross-device or provider-return journey |
| QA-R2 | An unverified test account cannot access protected NightJar content | **USER-REPORTED PASS (limited)** | D2 unverified denial; not revoked/pending/failed/underage coverage or full S1 |
| QA-R3 | A small test picture uploads, replacement succeeds, and the previous image disappears from the visible page | **USER-REPORTED PASS (limited)** | basic image upload/replacement UI; not moderation race, deletion of Storage bytes, second-account or stale-cache tests |
| QA-R4 | Writer draft saved on one device and same revision checked on another device | **NOT RUN — tester has not completed** | A3 |
| QA-R5 | Delete test social link with a photo and verify from another public view that both disappear | **NOT RUN — tester has not completed** | MS2 |

Follow-up evidence needed for QA-R1/2/3: device/browser, actual app build, date/time of observed test, second-account view and any relevant admin moderation state. Do not collect identity scans, tokens, private manuscript/audio files, signed URLs, live account identifiers or sensitive screenshots in this file.

New visual defect reported by user during QA-R3: picture displayed upper part but cut off lower part. Related [#242 image framing](https://github.com/Mort2307/NightJar-Audio/issues/242). Users need an accessible crop/fit preview, scale and pan guide *before* submitting an image for moderation. Users with already-approved pictures must be able to replace them through the normal moderation workflow; approved original assets are never silently modified.

**Formal acceptance status:** original 36-case matrix, 12 media-safety cases and full 16-workstream release acceptance retain their existing outcomes; this narrowly scoped evidence cannot sign off D2, D3, U7, MS2, S1 or other full scenarios. No new Didit sessions were created for these reports.
