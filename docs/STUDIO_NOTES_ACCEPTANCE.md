# Studio Notes — real-device and moderation acceptance

Updated: 22 October 2026. **Do not mark accepted merely because GitHub CI is green.**

Use a consenting adult test Creator, a distinct NightJar Administrator and two
age-verified Listener accounts (one subscribed, one without entitlement). Use
an original disposable audio clip owned by the test Creator. Do not use a
third-party script, another performer's voice or a genuine private recording.

| ID | Account and test | Expected result | Sign-off |
| --- | --- | --- | --- |
| SN-01 | Creator on Android/Chrome or PWA: select a released own parent and create Studio Note | Linked draft created; original remains unchanged | Pending device |
| SN-02 | Creator: upload short audio, supply title, description/category, confirm rights and submit | Private pending-review state; no listener preview | Pending device |
| SN-03 | Anonymous/unverified and age-unapproved user tries catalogue and direct link | No protected audio or transcript access | Pending device |
| SN-04 | Subscribed, age-verified listener while extra pending | Extra absent from catalogue/player and playback denied | Pending device |
| SN-05 | Admin approves the extra; Creator refreshes, subscribed listener refreshes | Approved note on original player, labelled Studio Note, playable through protected player | Pending device |
| SN-06 | Non-subscriber tries extra and transcript; credited creator views own | Subscription gating still applies and creator-specific entitlement works | Pending device |
| SN-07 | Player on phone: tap extra then Back to parent, browser back, focus and screen-reader labels | Correct release changes; no stuck overlay, duplicate playback or loss of focus | Pending device |
| SN-08 | Admin rejects an alternative note with reason | Rejected note never visible or playable; creator receives explanation | Pending device |
| SN-09 | Creator or Admin removes a parent, or removal races with approval | Orphaned extra cannot be newly approved and its protected playback/transcript/catalogue visibility are revoked | Pending device |
| SN-10 | Other Creator attempts association with someone else's release or a nested note | Server rejects without leaking private fields | Pending device |
| SN-11 | Creator uses phone and desktop, switches roles, refreshes with ongoing draft | No loss of release metadata or accidental Admin privileges | Pending device |
| SN-12 | Inspect storage, moderation and log records for test media; cleanup | No unauthorised public URLs or retained temporary private copies | Pending device |

**Technical constraints:** newly issued signed URLs must stop after parent
withdrawal; signed URLs issued earlier retain their existing short expiry.
Always use real account/entitlement data to validate the server-authorised paths.

**Deployment sequence:** this parent-status hardening changes backend only.
After PR review and successful CI, merge into main, then manually deploy selected
Cloud Functions in the protected production-backend workflow:
`moderateRelease,listCatalogue,recommendations,trendingReleases,getReleasePlaybackUrl,getReleaseTranscript`.
Verify each function is ACTIVE. Until then, the previous backend behaviour remains live.
