# NightJar Owner > People — mobile usability acceptance (24 October 2026)

Follow-up to owner-supplied 17-second Android screen recording showing 38px wide "View live profile" column, vertically stacked roles and hundreds of pixels of repeated controls.

**Expected layout:** each compact card initially shows member avatar, name, wrapping email/handle, status, approved role chips and two visible actions — **View profile** and **Manage access**. Role picker, account status and tester-access revocation appear only after explicit expansion. Advanced multi-professional role editor is a second expansion.

## Real-device checks
1. On Android 320, 360, 390, 430px and desktop: text never renders one word per line unless the word itself is long; no horizontal scroll; bottom navigation does not cover final card.
2. Long email and handle wrap sensibly without pushing the action button off screen.
3. View profile opens correct existing member profile. Returning preserves directory and scroll position where supported.
4. Manage access opens only the selected card; active role and account status changes still function and show errors clearly.
5. Remove tester access still requires an explicit confirmation and never deletes records or ID status.
6. Advanced professional role editor can grant, revoke and queue roles with the original safeguards; verify permission and account-role boundaries.
7. Close access then reopen: page remains usable; no controls for another member leak across rows.
8. Screen reader announces profile action, manage-access expanded state, and form labels.
9. Header shows official NightJar logo only on narrow devices; View-as, Upcoming, notifications, account and menu remain tappable and do not collide.
10. Scroll all the way to the final account and back; no jitter, accidental menu opening or obstructed controls.

Do not mark physical-device QA completed from CI alone.
