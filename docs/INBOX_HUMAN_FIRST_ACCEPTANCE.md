# Nightjar inbox: manual acceptance matrix

Scope: human-first inbox frontend PR only. Source contracts are regression guards, **not** proof that live messages work. No protected manuscript, payments, age assurance, or moderation permissions changed.

## Testing protocol
Use two real, age-verified eligible professional test accounts (and an Admin account for Inbox navigation), each with a separate device/browser session. **Do not** paste protected manuscripts into private messaging. Record build SHA, device, time, role, actual outcome and screenshots with private message text redacted. Mark each scenario PASS / FAIL / NOT RUN.

| ID | Test | Expected |
|---|---|---|
| M1 | Write unsent message in A, switch to B, type another message, return to A | Each recipient sees only their own in-session draft |
| M2 | Send message to A, rapidly switch to B before response | Sent message appears only in A; B's composer and history remain unchanged |
| M3 | Double tap Send / Enter rapidly on a slow network | Only one send request while pending; visible Sending; no duplicate outgoing message |
| M4 | Fail a send by disconnecting network | Draft stays editable and no false 'Sent'; reconnect and inspect remote thread before retry (network ambiguity) |
| M5 | Open slow-loading A, immediately open B | Late A fetch never overwrites B's message list, block state or collaboration |
| M6 | Search existing contact by name/handle and by last message preview | Matching existing conversation appears; start-new suggestions do not duplicate existing contacts |
| M7 | Set Inbox filter Unread/Needs reply/Awaiting, then search | Count and list remain consistent; no-match state isn't confused with server errors |
| M8 | Simulate failed inbox/thread call | Clear error and Retry appear; existing threads and unsent drafts are preserved |
| M9 | On Android phone open Inbox, enter A, then tap ← Inbox | Sidebar and thread use separate mobile views; no long scroll to find reply box |
| M10 | Open Admin Inbox from notification or header | Correct actual thread opens; unread and reply workflow remain available |
| M11 | Use keyboard, large fonts, screen reader, reduced motion and high contrast | Logical navigation, visible focus, labelled composer and message log, readable text |
| M12 | User A waits on an older thread; new poll arrives | Thread does not forcibly auto-scroll away from a message being read |
| M13 | Switch accounts and/or sign out while an old fetch is in flight | Old user draft and messages cannot appear under the next identity |
| M14 | Demo/preview modes | Non-simulation demo does not send real messages; Simulation behaviour remains isolated |

## Go/no-go
- Verify GitHub typecheck, production build and full relevant contract suite on PR head.
- Prefer Firebase Hosting preview for Android/PWA and desktop; test iPhone where available.
- Require role-aware auth/verification and backend permission tests for two-party send/read/report/block and cross-account denial before production release.
- Document failed/untested cases explicitly. Merge/deploy only after review and normal release gates.
