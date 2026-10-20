# Nightjar media safety: device acceptance worksheet (20 October 2026)

**State: NOT RUN.** No automated build, passing PR check or completed deployment counts as a real-account PASS. This worksheet supplements the existing 36-case [hardening matrix](nightjar-hardening-acceptance-2026-10-18.md); it does **not** change any previous case from NOT RUN.

Only use owned synthetic test assets (small non-sensitive PNG/JPG/WebP, consented synthetic Creator audio). Do not record or upload government ID documents, access tokens, protected manuscripts, actual signed URLs, private Storage paths, passwords or personal account identifiers in the evidence. Do not initiate fresh chargeable Didit checks.

## Test setup

- Two explicitly approved test accounts (A: Creator/Editor/Writer as required; B: different active member; plus approved Admin if needed).
- Android app/PWA and desktop browser, each signed into a distinct controlled account. Record date, platform/browser and build SHA; verify the latest deployment run first.
- In Firebase emulator only, inject failures between Firestore commit and Storage deletion, or Storage deletion and receipt finalisation. Never deliberately destroy real production files.
- A *PASS* requires observed canonical state, live playback/access checks as applicable, truthful UI, and a retry confirming final byte removal. Document which account/device witnessed each case.

| Case | Acceptance test | Expected result | Outcome |
| --- | --- | --- | --- |
| MS1 | A changes a social URL while the old approved photo is displayed by B | Old photo is detached from public display; new social URL is visible without the old person's image | NOT RUN |
| MS2 | A deletes a link with both approved and pending photo submissions; B refreshes | Link and images are inaccessible publicly; pending moderation cannot approve retired asset | NOT RUN |
| MS3 | In emulator, fail Storage deletion after social-link retirement; reload on Android and desktop | Link remains hidden; owner sees **Retry private photo cleanup** with no path leak; retry removes bytes and receipt | NOT RUN |
| MS4 | Two devices simultaneously remove/change the same link while an image upload finishes | Canonical Firestore identity wins; stale completion cannot reattach a retired image; no unreviewed image becomes public | NOT RUN |
| MS5 | A removes profile portrait and cover; fail a single Storage deletion in emulator | Public pointer is removed; account still exposes retry state across refresh; no false claim of permanent deletion | NOT RUN |
| MS6 | Admin generates three new install icons, then refreshes manifest and icon endpoints | All three new files load together; installation manifest points to the new version; no missing live icon while replacing | NOT RUN |
| MS7 | Emulator fails Firestore swap after icon upload or a staged icon upload fails | Old icon triplet remains live, untouched; no new partly staged set is made public | NOT RUN |
| MS8 | Emulator fails deletion of retired branding files, then Admin retries | New active icons remain live; private receipt persists; Admin retry cleans old bytes, with no raw path displayed | NOT RUN |
| MS9 | Admin removes an approved logo while a replacement is pending | Active and pending references are retired atomically; deleted logo/image URLs are inaccessible; app manifest uses packaged fallback | NOT RUN |
| MS10 | Two Admins concurrently approve and remove/replace a brand logo | Only current pending approved asset may be published; stale review is rejected; old icon receipts are not lost | NOT RUN |
| MS11 | Listener account B invokes Admin branding/cleanup and member A's social cleanup endpoints | Unauthorized writes are rejected; private cleanup IDs or paths do not leak to B | NOT RUN |
| MS12 | Creator/Editor upload remove and stale finalization; Moderator suspends release; B tries stale media link | U9, S1, S2 verified with two devices and account permissions; stale references do not restore playback | NOT RUN |

## Recorded evidence

For each case record: case ID, `PASS | FAIL | BLOCKED`, Android/desktop/iOS environment and version, test date, production SHA, sanitized issue number and a one-sentence observation. A screenshot is optional and should contain no member personal data.

## Sign-off rules

1. No acceptance claims without real device/account observations. Store results in Quality Centre and the existing 36-case matrix where a scenario overlaps.
2. Any age-assurance bypass, unauthorized access, lost active upload, stale reattachment, or unjustified permanent-deletion message is a blocking FAIL.
3. Targeted backend deployment must finish successfully **before** Hosting sign-off for each media change. Review both workflows separately.
4. Existing orphan-audio and image-object inspections remain **read-only**; never enable a scheduled sweep or delete flagged production files automatically.
5. Keep #219 and #252 open until device evidence is recorded and outstanding exceptions explicitly resolved or formally deferred.
