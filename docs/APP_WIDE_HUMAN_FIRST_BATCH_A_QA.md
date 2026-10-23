# Nightjar app-wide refinement — shared UI acceptance, batch A

Status: **code review / physical-device testing pending**. A green typecheck, unit/contract suite and Hosting preview are not proof of usability.

## What this changes
One shared, late-imported stylesheet improves legibility for Nightjar's status banners, search/command palette, dashboard counters, next-action controls, notification section headers, five-item mobile dock and mobile text-entry controls. The objective is an immediate reliability and accessibility win **without changing Nightjar's Midnight Gold identity**.

Excluded intentionally: actual protected media, player sound, 18+ Didit access, authentication, business rules, manuscript permissions, billing, Firebase backend, account data and unverified visual overhauls. No external fonts, images, AI features or third-party dependencies.

## Baseline and technique
Existing `src/styles/product-system.css` had 6.5–9px labels in operational surfaces; `src/index.css` contains further small-copy declarations. We override **only named, high-frequency operational components** after the theme styles. We don't globally make every `small`, `span` or `button` larger because that could damage playback controls, timestamps, image overlays or forms.

Vision Access high-contrast overrides are excluded from the new font-size rules. Existing focus, contrast and motion preferences remain authoritative. Contract tests check the import order, operational selectors and protection against accidental remote assets.

## Manual acceptance — mark PASS / FAIL / NOT RUN

| ID | Screen/role | Expected result |
| --- | --- | --- |
| A1 | New account, login, password reset on 320px iPhone Safari | Text inputs focus without unexpected browser zoom or clipped buttons; secure autocomplete unaffected |
| A2 | 390px Android/PWA Home and 320px narrow viewport | All five mobile dock destinations remain visible, 11px+ labels, correct active state, no horizontal scrolling |
| A3 | 390px Writer dashboard with long script names | Metric labels, next actions and descriptions readable; no cards overlapping |
| A4 | Creator dashboard with pending uploads/reviews | Counter labels and actionable next steps readable; upload state and buttons unchanged |
| A5 | Admin overview with queue warnings | Status messages, retry controls and notification headings readable and usable |
| A6 | Global search palette (keyboard and mobile) | Results display title and description fully, keyboard selection preserved and targets at least 44px |
| A7 | Offline / failed request / update available | Status banner wraps on narrow widths; any retry button remains reachable; no dismissed state lost |
| A8 | Long professional handle and long notification | Text wraps without covering icons or forcing horizontal document scroll |
| A9 | Vision Access: paper, focus, soft; contrast and large-text preferences | Theme surface/contrast/size overrides retained; not forced back to Midnight Gold |
| A10 | OS reduced motion enabled | No new transition or smooth-scroll behaviour; existing player and navigation still usable |
| A11 | Keyboard/assistive tech: tab, Enter, Escape, TalkBack/VoiceOver if available | Interactive elements have visible focus; alerts, labels and navigation available with sensible names |
| A12 | Phone landscape, 768px tablet, 200% browser zoom, desktop | No clipped modal footer, overlapping dock, missing action or inaccessible content |
| A13 | Listener Library, premium player and transcript | Playback, optional transcript, EQ and protected routes unaffected |
| A14 | Second verified role and unverified test role | App backend 18+ and permissions unaffected; no cross-account view or bypass |

Capture device/browser, roles, exact PR SHA, before/after screenshot for changed surfaces, expected/observed, test status and bug link. Do not include protected manuscript contents, messages or ID documents in evidence.

## Build/release checks
- [ ] `npm run typecheck`, `npm run build`, `npm run validate:contracts`, full `npm run validate`
- [ ] GitHub preflight and Firebase **PR preview** against the exact branch head
- [ ] Visual sampling of A1–A14; run A1/A2/A3/A5/A6/A9 on at least one phone before merge
- [ ] Separate Admin/Writer/Creator/Listener role sanity, 18+ flow and media permissions
- [ ] Confirm Hosting production source/build SHA after any approved merge; no Cloud Function deployment necessary for a CSS-only change

Rollback: revert this narrow style import (and its associated stylesheet), preserving all user data, user settings and message history.

Coordination: tracking issue #295; previous design/inbox draft PRs #293/#294 remain separate. Do not silently merge their still-unreviewed changes into this one.
