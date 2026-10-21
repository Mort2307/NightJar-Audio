# Approved Creator, Writer and Artist artwork — acceptance tests

Status: **NOT RUN** as of 21 October 2026. CI is not a substitute for real accounts and devices.

This is the second non-destructive image-framing rollout after #265 for member portraits/covers. Each adjustment modifies **only** bounded presentation metadata tied to the same current approved work-image asset. It must never create a new pending image, alter age verification, change artwork rights, remove stored media or reset a live release.

| ID | Required device / role check | Status |
| --- | --- | --- |
| AW1 | Creator on Android changes framing of previously-approved **published** release artwork; saved image appears in playback and on public release without new approval or media upload | NOT RUN |
| AW2 | Writer changes approved manuscript cover; Writer view, marketplace and other account match; source manuscript remains private | NOT RUN |
| AW3 | Artist saves new focus of published portfolio image; own and public grids/featured artwork match; human-made rights attestations remain unchanged | NOT RUN |
| AW4 | Open editor on Android, replace/remove approved image from other device, then save stale editor; must fail and leave new approved image intact | NOT RUN |
| AW5 | Try another account's asset/work IDs, an unapproved/pending/revoked image, a suspended or age-unverified account; callable must deny | NOT RUN |
| AW6 | Invalid mode, zoom (below 1 or above 3), NaN/infinite, position outside ±100; no writes | NOT RUN |
| AW7 | Smartphone drag, pinch, show-whole mode, intentional crop, reset, keyboard controls, 200% text, high contrast, TalkBack/VoiceOver and reduced motion | NOT RUN |
| AW8 | Refresh/switch device and confirm framing persists across portrait/landscape container aspect changes without distorting artwork | NOT RUN |
| AW9 | Previously approved artwork without focal data still displays full original; hidden or removed artwork cannot reappear through the saved frame | NOT RUN |
| AW10 | Verify no additional uploads, duplicate image records, chargeable Didit checks, unmoderated public images, loss of legal rights declarations or changes to original content | NOT RUN |

**Evidence to collect:** role, device/app shell/browser version, production commit, outcome PASS/FAIL/BLOCKED, concise redacted screen observation. No real IDs, scans, account secrets, protected script content or unredacted media in GitHub.

Original QA-R1–R3 are three user-reported limited passes and do **not** cover this change. Previous QA-R4 Writer cross-device draft and QA-R5 social photo unlink are still **NOT RUN**. Keep #242 and #219 open until human QA provides proof.
