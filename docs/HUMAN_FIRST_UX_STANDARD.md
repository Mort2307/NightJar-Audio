# Nightjar: human-first product and interaction standard

Status: **design and acceptance guardrails, not a shipped UI change**. Use alongside the active hardening, media-framing and admin/creator workflow issues. These rules guide both hand-written and assisted code.

## Creative direction
Nightjar should feel like a carefully art-directed listening room, **not a generative-AI demo or an off-the-shelf admin template**. Premium, seductive and understated; never visually explicit for effect. Use the already approved Midnight Gold identity. Dark/obsidian grounds, purposeful champagne-gold details, crisp legible type, deliberate negative space and authentic artwork make releases the focus.

Keep a restrained visual rhythm: a strong spotlight, clear section breaks and artwork-led content. Avoid five equally weighted cards competing for attention, placeholder gradients, fake creator portraits, arbitrary glassmorphism, exaggerated glowing controls, generic chatbot panels, excessive emoji and animation-for-animation's-sake. Reuse existing primitives before introducing another component library.

## Human voice
- Use specific task language: "Submit manuscript", "Review release", "Save draft", "Message creator", "Adjust framing", "Open inbox".
- Use plain, calm feedback: "Uploading 68%", "Draft saved", "Could not save. Your draft is still on this device. Try again." Only say "saved" after durable persistence is confirmed.
- Explain consequences before action; do not pressure people into verification, payment or sharing. Never invent listening counts, endorsements, approvals or creator credits.
- Subtle adult mood is welcome in marketing and discovery, not at the expense of clear forms, accessibility, moderation or user trust.

## Interaction standards
1. One obvious primary action per context, with useful secondary actions and discoverable back/cancel paths. Aim for at least 44×44 CSS px touch targets, with visible focus and readable labels.
2. Every data-backed surface has intentional **loading, empty, recoverable error and complete/success** states. Empty means genuinely empty, not a failed request hidden as zero.
3. All uploads/submissions show progress and disable re-submission in flight. Duplicate clicks must not create duplicate records, queue entries, pushes or emails. Preserve draft input and provide retry only when safe.
4. Delete, withdraw and reject have correct entity-specific wording. Show `🗑 → Are you sure? → Cancel / Confirm` when appropriate and never bypass backend permissions or destroy approved work accidentally.
5. Content imagery defaults to full-image framing for portraits and art that contains meaningful detail or typography. Decorative banners may crop with accessible reposition/zoom/reset and a true preview. Moderate the original asset; focal adjustments cannot approve or expose it.
6. Messaging: links open the actual thread/inbox; unread indicators reflect reachable messages, not merely historical activity. Role-specific navigation must remain predictable.
7. Transcript controls are optional, plainly labelled, keyboard-accessible and creator-reviewed. Do not silently invoke speech AI or send protected text/audio to external processing.
8. Nightjar age assurance remains mandatory for protected 18+ areas; show clear state and return routes without repeatedly challenging already-approved accounts. Never let presentation hide an access error.
9. Screen-reader labels, logical focus order, user-scalable text, high contrast and reduced-motion behaviour are first-class; dim ambient artwork must not harm text contrast.

## First QA journeys (do not assume currently passing)
| Journey | Proof to capture |
| --- | --- |
| Writer uploads a manuscript and taps submit twice | Exactly one pending item; visible busy state; recoverable offline/error path; Admin count matches authoritative queue |
| Creator opens a listing and selects "Message creator" | Correct synopsis and accessible conversation/inbox; replies retrievable as Admin/creator |
| Admin opens inbox and moderation queue | Accurate badge/count; real failures distinguished from empty queues; no stale duplicated alerts |
| Creator deletes one eligible duplicate draft | Named two-step confirmation, Cancel works, only selected record removed; approved work unchanged |
| Owner uploads tall/wide/square artwork | Original preserved in preview, adjust framing keyboard/touch, final card and public page match |
| Verified and unverified user sign back in on another device | Persisted verification for approved account; protected routes blocked for unverified |
| Listener uses player + optional transcript | Accurate seek/line display; reduced motion, scaling and lock-screen controls where supported |
| Slow/failed connection during form edit | No silent data loss, false success or infinite spinner |

Test at realistic mobile widths, Android APK/PWA, desktop and available iOS hardware. Capture expected vs observed behaviour, route, role, build SHA and screenshots with user-sensitive information redacted. Record **NOT RUN** rather than inferring from tests.

## Acceptance and release
- Frontend UX PR: list affected roles/screens, before-and-after difference, confirmed data path, states, keyboard/screen-reader behaviour, test instructions and rollback.
- Verify lint/typecheck/build/contracts from the merged source. A successful CI check does not establish visual quality or tester acceptance.
- Sensitive changes to verification, permissions, Cloud Functions, media protection or billing require separate backend review and release gating before Hosting; never hide functional changes inside a style PR.
- Only ship visual changes after review; never auto-apply generated designs, replace user-created art or add an AI-labelled feature without a product decision.
