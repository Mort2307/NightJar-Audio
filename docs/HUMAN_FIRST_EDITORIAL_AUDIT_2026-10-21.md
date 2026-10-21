# NightJar human-first editorial audit — 21 October 2026

## Goal
NightJar is a creator-led, adult audio platform. Its design should feel considered, cinematic and personal, not like a generic technology demonstration. The objective is to remove robotic wording and repetitive decoration without masking actual technology, misrepresenting content provenance, or weakening member safety.

## This pass
- Reworked member-facing text on Discover, recommendation empty states, Trending, public profiles, onboarding, the Spotlight, profile settings and selected professional pages.
- Removed the hero's decorative orbital elements and the tilted featured-card treatment, retaining Midnight Gold and the original cover artwork as the visual focus.
- Replaced selected decorative sparkle icons with meaningful, existing icons.
- Rephrased technical recommendation explanations and privacy language in plain English, without changing recommendation processing or private settings.
- Kept Didit age assurance, copyright, moderation, creator credits, legal terms, provenance and security status intact.

## Full-app review coverage
| Surface | Audit expectation |
| --- | --- |
| Guest, access and onboarding | A human welcome; keep required consent and age checks |
| Discover, spotlight and catalogue | Lead with people, works and listening; not recommendation machinery |
| Listener library and player | Clear actions, relevant statuses and accessible controls |
| Writer, Creator, Editor and Artist studios | Practical workflow instructions; no marketing filler during a task |
| Public profiles and directories | Credit real people; feature their own words and artwork |
| Messaging, community and notifications | Clear sender, event, outcome and next step; never imply a person wrote an automated message |
| Administration and safety | Precision takes priority over mood; don't hide compliance information |
| Settings and help | Progressive disclosure, clear plain-English language, accessible labels |
| Legal, age assurance and security | Preserve legally meaningful disclosure and consent |
| Demo and preview | Explicitly label fictional/preview material; never pass it off as real content |

## Editorial rules
1. Prefer **'Listen'**, **'Follow'**, **'View work'**, **'Edit profile'**, **'Try again'** over abstractions such as 'unlock your journey' or 'discover your potential'.
2. Keep decorative sparkles, synthetic orbital shapes, gratuitous gradients and unnecessary animation out of the main editorial hierarchy. Use NightJar's approved Midnight Gold palette and authentic artwork.
3. Keep real creator credit, provenance and member-supplied text exactly as supplied. Never silently rewrite user-generated material.
4. Do not claim that NightJar or its catalogue is 'AI-free' unless that is independently substantiated for the exact claim. Do not remove any legally or contractually required AI or other content-provenance disclosure if one becomes applicable.
5. Text on administrative and diagnostic screens can remain technical where precision is required, but technical internals should not appear in everyday member-facing copy.
6. Do not change authentication, age gates, moderation, upload pipelines, payouts, or legal terms under the guise of cosmetic polishing.
7. Respect reduced motion, high-contrast/vision modes, keyboard focus, labels and screen readers.
8. On each release, review all five roles on mobile and desktop: Listener, VA Creator, Writer, Audio Editor and Artist; additionally test Admin.

## Evidence and remaining verification
This source-code audit is not a completed screenshot-by-screenshot production review. Before merge or release, run the repository's full existing validation suite and verify screenshots for dark/high-contrast modes at narrow and wide widths. Check live templates, push/email copy, and user-generated art or text separately. Sign-off only once the real-device matrix passes.

## Regression check
`scripts/human-first-copy-contracts.mjs` locks the most conspicuous legacy phrases out of the affected source surfaces. It deliberately excludes user-generated material, provider messages and legitimate technical/admin descriptions.
