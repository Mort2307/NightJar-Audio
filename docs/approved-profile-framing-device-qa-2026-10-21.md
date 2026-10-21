# NightJar approved-profile image framing: device acceptance

**State: NOT RUN (21 October 2026).** Automated CI and deploy success are not live account sign-off. This complements #242 and the existing hardening matrix.

## New capability

An account owner can select **Adjust approved portrait** or **Adjust approved cover**, use fit/fill, zoom and position, then save a bounded focal record tied to the current approved asset ID. It does not upload or replace media, change rights/approval, or call the ID provider. Existing approved images without framing records keep their normal appearance. Frame settings are published only while the referenced image ID and approval remain current.

## Hands-on acceptance

| ID | Scenario and evidence required | Outcome |
| --- | --- | --- |
| AF1 | Approved member on Android changes portrait to Fit, repositions and saves, no upload/reapproval queue item created; previous picture remains approved | NOT RUN |
| AF2 | Same member signs into desktop and sees the exact saved image positioning after refresh | NOT RUN |
| AF3 | A different approved member sees the same framing on public profile, never sees pending assets | NOT RUN |
| AF4 | Approved custom cover adjusts and displays on phone/desktop without removing text or cutting bottom of photo | NOT RUN |
| AF5 | With edit modal open, replace or remove image from another device before Save; stale asset ID is rejected; latest image remains live | NOT RUN |
| AF6 | Unverified/suspended/foreign user attempts direct callable or spoofed asset ID; write rejected with no private file access | NOT RUN |
| AF7 | Try NaN/infinite and values outside mode, zoom 1–3, x/y ±100; server rejects without modifying record | NOT RUN |
| AF8 | Test 200% text, keyboard arrows, screen reader focus/escape and mobile pinch/drag without inaccessible controls | NOT RUN |
| AF9 | Verify saved settings do not silently overwrite unrelated unsaved profile text on another device | NOT RUN |
| AF10 | Approve a replacement after changing framing; prior asset focal settings do not apply to new approved artwork | NOT RUN |

Record a date, device/browser, test role only, sanitized production commit, and PASS/FAIL/BLOCKED for each. Do not store identifiers, personal images, signed URLs, ID documents or unredacted screenshots in GitHub.

Existing QA-R1/2/3 remain **USER REPORTED PASS — limited**. The outstanding Writer cross-device save QA-R4 and deleted social link QA-R5 remain **NOT RUN**.
