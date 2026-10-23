# Navigation reliability — Batch B acceptance

Scope: Home / Creator / Writer section navigation only. Changes are frontend event/scroll behaviour, not account permissions, protected content, Firebase data or theme. The app-wide tracker is #295.

## Reason for this fix
Several navigation buttons dispatched an “open section” event, then assumed React had rendered a newly expanded/lazy section in 40–60 ms. Fast links could land at the wrong position or not scroll at all, particularly after a section was hidden using member preferences. Some Creator dashboard metrics attempted to scroll inside a folded workspace or fell back to the unrelated Profile screen.

## New behaviour
A shared helper dispatches the existing open-section event, observes the Nightjar application root for the matching rendered section with `aria-expanded=true`, and only then scrolls. It honours reduced motion and disconnects observers when completed or after five seconds. Home and workspace sections retain the user's existing preferences and their current access controls. No global click handler, forced page reload or scroll on routine re-render.

## Real-device regression matrix

| ID | Steps | Expected |
|---|---|---|
| N1 | Collapse **Published audio** on Home, tap **Browse audio** | Catalogue section opens and viewport reaches its heading |
| N2 | Hide **Published audio** using Customise Home, tap **Enter the listening room** | Hidden section is restored, expanded and reached without repeated taps |
| N3 | Collapse **For you**, tap **Personalise** above Published releases | For you opens and viewport reaches the correct section |
| N4 | Collapse **My audio releases** in Creator Studio, tap the **Releases** metric | Studio pipeline opens; any creator draft remains untouched |
| N5 | Collapse **Listening insights**, tap **Qualified listens** | Correct metrics workspace opens and scrolls into view |
| N6 | Collapse **Collaborations**, tap Creator's **Collaborations** metric | Opens Creator collaboration workspace, not Profile |
| N7 | From Writer Studio, tap **Collaborations** metric | Writer collaboration workspace opens; Creator role not inadvertently selected |
| N8 | Open a draft manuscript and collapse rights, tap **Review rights & submit** | Correct Writer rights section opens; **nothing is submitted automatically** |
| N9 | Repeat N1–N8 on slow 3G/network delay and rapid taps | No unintended scroll to unrelated section, no role mutation, no duplicate Firestore actions |
| N10 | Android 320px/390px, desktop 200% zoom, keyboard and reduced-motion | Destination visible below header, content readable; no unexpected animation |
| N11 | Normal menu navigation and Back/Forward history | Existing scroll-top route behaviour and history/deep links stay unchanged |
| N12 | Across different verified accounts and unverified accounts | Existing age gates, private scripts, drafts and role permissions remain enforced |

## Exit gates
- GitHub TypeScript typecheck, build, full validation, preview and security preflight must all pass.
- Review actual preview on a phone before calling N1–N12 accepted; CI/source contracts don't certify live interactions.
- This PR does **not** merge existing PR #294 (Inbox) or #296 (readable UI); validate their combination before a combined production release.
- If a section is not mounted or cannot be opened, the helper quietly disconnects rather than scrolling to an incorrect destination.
- Reverting this PR restores prior event/scroll handling without modifying user records.

Test statuses: **N1–N12 NOT RUN** until physical-device evidence is supplied.
