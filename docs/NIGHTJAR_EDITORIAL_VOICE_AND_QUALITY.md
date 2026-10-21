# NightJar — editorial voice and quality standard
Owner-approved direction: 21 October 2026

## The standard
**Human in personality. Exact in execution.** NightJar should read and look like it was thoughtfully made by a small, accomplished editorial and product team. Design should feel intimate, quietly confident and creator-led, with Midnight Gold used as an identity, not a distracting effect.

## Writing rules
1. **Write for one person.** Say what happened, what they can do next and why it matters. Prefer “Your recording is ready for review” to congratulatory sales copy.
2. **Be specific rather than grand.** No “unlock your potential”, “delve into a world”, “reimagine”, repetitive abstract slogans or breathless filler.
3. **Let the creator speak.** Titles, descriptions, profiles, scripts, artwork credits and personal announcements are authored by their owners; never silently rewrite them or dress them in generic platform phrasing.
4. **Plain British English.** Consistent spelling, punctuation, labels, capitalisation and dates, with contractions where natural. Use an em dash only when it genuinely clarifies a sentence, not in every paragraph.
5. **Keep interactions reassuring but brief.** A failed action needs a concrete, accurate reason and a recovery route. Never imply success before the service confirms it.
6. **Show trustworthiness, don't announce it.** Real moderation, credits, identity checks and privacy controls demonstrate quality. Do not add decorative “AI-free” badges or defensive marketing.
7. **No accidental generation artefacts.** Block unfinished placeholders, lorem ipsum, assistant self-references, stock AI copy and boilerplate filler in shipped UI.
8. **Clear attribution.** Identify system messages as system messages; never impersonate the NightJar team. Preserve legally required statements about AI training, authenticity and provenance.
9. **Design with restraint.** Real creator artwork and typography carry the identity. Avoid filler cards, needless glows, fake activity and repetitive sparkle symbols.
10. **Accessibility is editorial quality.** Test clear focus, labels, contrast, readable text, reduced motion, cropped images and every role's mobile journey.

## Review rubric
| Dimension | Acceptance |
| --- | --- |
| Voice | Natural, consistent, not overly enthusiastic about routine tasks |
| Precision | No false claims, ambiguous actions or unsupported guarantees |
| Grammar | Proofread British spelling, punctuation, capitalisation and typos |
| Accessibility | Keyboard, screen reader, large text, contrast, mobile states |
| Authenticity | Real people and credit attribution; no fabricated social proof |
| Integrity | Security, age assurance, ownership and legal wording remain accurate |
| Visual balance | Meaningful hierarchy, approved Midnight Gold, authentic artwork |
| Consistency | Listener, Creator, Writer, Editor, Artist and Admin labels agree |

## Examples
| Avoid | Use |
| --- | --- |
| “Embark on your creative journey!” | “Add your first recording.” |
| “Your recommendation graph is forming.” | “Follow a creator or save something you like.” |
| “An unexpected error has occurred.” | “We couldn't save your changes. Try again.” (only when retry is safe) |
| “We're delighted to inform you...” | “Your work has been approved.” |
| “No AI powering this seamless experience” | “Choose a mood to browse recordings.” |

## Enforcement
- scripts/human-first-copy-contracts.mjs prevents regressions to previously identified copy.
- scripts/editorial-quality-contracts.mjs scans authored TS/TSX application strings and text for high-confidence generated-copy giveaways; it includes positive and negative tests.
- Automated checks are not grammar checkers or AI detectors. Proofreading and role-based screenshots remain necessary.
- Never scan or rewrite user-generated Firestore content, approved uploads or third-party messages. Preserve relevant AI-related rights notices.

## Release sign-off
Review Listener, Creator, Writer, Editor, Artist and Admin desktop/narrow-mobile journeys, including empty, error, pending, approved and success states. Recheck member emails, push text and dark/vision variants before declaring a release fully polished.
