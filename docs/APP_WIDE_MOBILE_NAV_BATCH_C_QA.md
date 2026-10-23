# App-wide refinement Batch C — mobile account navigation and truthful actions

Scope: mobile five-tab navigation, Inbox/Activity accessibility metadata, shared role dashboard loading messaging. Tracking issue #295.

## Behavioural contract

| Member action / state | Condition | Behaviour | Status |
| --- | --- | --- | --- |
| Tap **You**, then open Profile | Any eligible signed-in role | The same **You** tab stays current (not visually deselected) | CI source/logic; device NOT RUN |
| Open Calendar from account tools | Any eligible signed-in role | **You** remains current; Calendar page remains open | Device NOT RUN |
| Open Protection Centre | Any eligible signed-in role | **You** remains current; no change in actual data permissions | Device NOT RUN |
| Open Home / Library / Directory / workspace | Correct role | Only that exact tab stays current; You does not impersonate a workspace | Device NOT RUN |
| Receive a Listener activity alert | 1 / 10+ unread | Visual badge retains 1 / 9+; accessible tab name announces the exact number | Device NOT RUN |
| Receive an Inbox message | 1 / 10+ unread | Visual badge remains compact; screen reader hears exact unread count | Device NOT RUN |
| Professional conversation awaits response | 1 / several needs-reply threads | A screen reader can hear the reply count even if unread messages are present | Device NOT RUN |
| Switch Listener ↔ Creator/Writer/Artist/Editor/Admin role | Approved roles only | Five unique tabs appropriate to current role; no recycled Activity↔Search identity | Device NOT RUN |
| Role workspace loading | Dashboard actions are not loaded | Show **Checking your account…**, not the misleading **You’re caught up** claim | Device NOT RUN |
| Role workspace loaded with no suggested action | Fully loaded | **You’re caught up** remains the correct empty state | Device NOT RUN |

## Physical acceptance matrix
- [ ] M1: 320px iPhone Safari, VoiceOver; 390px Android/PWA, TalkBack: Account Profile/Calendar/Protection focus and currently-selected tab
- [ ] M2: Admin 5-tab dock; Inbox, Home, Admin selection, non-admin controls absent
- [ ] M3: Listener Activity count 0 / 1 / 12 using actual test notifications
- [ ] M4: Creator/Writer Inbox unread 0 / 1 / 11, reply-needed simultaneously, badge and accessible label agree
- [ ] M5: Account switch using approved roles (no permission bypass); keyboard focus and long labels
- [ ] M6: Offline/throttled Home and role dashboards while loading, retry, true zero-actions; no success claim before completion
- [ ] M7: 200% zoom / portrait / landscape, Midnight Gold and Vision Access presets unaffected
- [ ] M8: Before release, regression test composer draft segregation from pending #294 and navigation previews #296/#297 on the same build

## Boundaries and release
No Firestore, auth, Didit, audio/media, paid features, backend function, or theme changes. This is a frontend-only UX adjustment: role visibility and unread counts remain owned by existing APIs, never this helper. Existing `aria-current` and five destinations preserved. Pure behavioural tests exercise the compiled TypeScript helper, integrated into the existing standard mobile contract runner.

Do **not** mark physical tests PASS on CI success. PR preview can reach real Firebase; use disposable test accounts/content and do not destroy live records. Merge only after reviewing outstanding PR overlap and the release gate. Reversion removes the helper/component adjustments, with no data migration required.
