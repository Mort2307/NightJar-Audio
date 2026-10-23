# Nightjar personal calendar — app-wide Batch D acceptance

Changes scoped to **private personal calendar events**, not Creator release scheduling, moderation or publication. Tracking issue #295.

## Confirmed source problem
On the existing main branch, the date picker used `chooseDate()`, which cleared the active editing ID and title/note. Editing an existing event and changing its date could therefore create a *new* event instead of updating the original. The client also only checked that a date parsed, accepting impossible civil dates that the backend later refused. Failed data refresh only displayed a temporary toast, potentially making the calendar appear to have no events.

## Implemented
- Independent draft event date while editing; selecting a calendar day still starts a new form.
- Save supplies the existing event ID and new date to Nightjar's authenticated callable; the visible calendar follows the saved date/month *only after confirmation*.
- Civil dates validated to the backend's 2000–2100 range and true Gregorian day counts; no UTC-midnight all-day drift.
- Immediate in-flight guard against two submit taps creating duplicate private dates, also protects delete and time-zone updates.
- Failed calendar refresh shows a persistent readable error with a Retry button; don't silently claim an empty calendar.
- Improve narrow phone day labels from 8px to 10px, preserving Midnight Gold.

## Real-device checks (NOT RUN)

| ID | Scenario | Expected |
| --- | --- | --- |
| C1 | Create personal date on 23 Oct | Exactly one event saved; title and optional note appear in selected day |
| C2 | Edit C1 title/note, same date | The same server event updates, not a duplicate |
| C3 | Edit C1 and change date to next month | Date picker changes only edit draft; original event ID preserved; after save, calendar selects new date and month, old day no longer contains event |
| C4 | Change date while editing then cancel | No server update; original event still appears on original date |
| C5 | Double-tap save rapidly, or slow network | Only one submitted write; button states truthful; no double event |
| C6 | Backend rejects save or connection interrupted | Data and edit fields retained for retry; do not announce saved |
| C7 | Refresh/load fails or device offline | Persistent error notice and Try again; prior events not silently erased |
| C8 | Date picker 29 Feb 2024 vs 29 Feb 2025, 31 Apr, range edges | Leap day accepted only when valid; invalid/out-of-range date blocked client-side |
| C9 | Switch Europe/London ↔ America/New_York across DST | All-day private date stays on selected civil day; audio scheduled times reflect chosen zone |
| C10 | Remove one of several dates while editing another | Correct item removed only after confirmation; unrelated edit not destroyed |
| C11 | Creator and Admin schedule cards | Read-only release schedule unaffected; approving/publishing remains a separate protected workflow |
| C12 | Phone 320px/390px, tablet, keyboard, Vision Access, reduced motion | Labels legible, controls reachable, no clipped content; existing appearance intact |

## Safety gates
- [ ] Typecheck, full validation, modular validation, PR preflight and Hosting preview for this exact HEAD
- [ ] Account A/B isolation and 18+ access confirmed in a real two-account test
- [ ] Date-edit scenarios C1–C12 on a real device, with **test data only**
- [ ] Confirm other open app-wide draft PRs #293/#294/#296/#297/#298 do not conflict
- [ ] Recheck merged release SHA and hosting before production declaration

This is **frontend only**. No Firebase Cloud Function changes, Firestore rule changes, payments, external AI processing or script permissions. The Hosting PR preview can access existing test environments/services; avoid modifying real member records. No manual test is automatically marked PASS by CI.

Rollback by reverting the PersonalCalendar component/CSS/date helper and test changes; no database migration.
