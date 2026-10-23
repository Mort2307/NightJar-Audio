# Nightjar — repository development instructions

Nightjar is a premium, human-led audio platform for adults. Keep its identity distinctive, discreet and creator-centred. Before making a visual or interaction change, read `docs/HUMAN_FIRST_UX_STANDARD.md`.

## Product and design invariants
- Preserve the Midnight Gold visual language: obsidian/black surfaces, restrained champagne-gold accents, deliberate typography and accessible contrast. No generic SaaS gradients, gaudy neon, floating chatbot ornaments, emoji confetti, random stock faces or repetitive over-carded dashboard layouts.
- Give each screen a clear action and hierarchy. Keep mobile routes thumb-friendly, keyboard operable and screen-reader intelligible. Honour reduced motion, text scaling, and high-contrast modes. Never sacrifice readable text for ambience.
- Keep Nightjar audio-first. Writer, Creator, Editor, Artist, Credited member and Listener flows must show the correct permissions and labels. The gold crescent indicates a genuinely approved Creator only; do not confer it on listeners or merely credited accounts.
- Use warm, concise, specific human copy. No generic "unlock your journey", fake urgency, invented testimonials, anthropomorphic AI assistant persona or automatic creative content.
- Submission and upload: explicit progress, only one active request, disabled repeated submit, recoverable failure and persistent drafts. Save acknowledgements must reflect real backend confirmation. Never show a success message on optimistic assumptions.
- Destructive actions: item-specific two-stage confirmation where required, preserve approved work, and use backend permissions. A frontend confirm is not an authorisation boundary.
- Creator-owned media: preserve original aspect where content matters; crop only with intention and an accurate preview. Protect moderated/private media and do not use face detection or external AI editing by default.
- Do not introduce AI generation or speech-recognition processing, third-party upload, paid cloud services, new trackers or changes to creator rights without explicit separate approval. Existing transcript import/manual synchronisation remains the safe baseline.
- Keep Didit/account verification and protected-content gates fail-closed. Do not enable payments, loosen compliance or bypass verification for visual polish.

## Engineering and review
- Inspect current source and open tracking issues before proposing new UI. Small focused PRs; preserve live Firebase project, authentication, privacy, review and moderation architecture.
- For any visible UI change, include a before/after summary, affected roles, mobile/desktop and accessibility scenarios, loading/empty/error/success states, and acceptance evidence. Follow `docs/HUMAN_FIRST_UX_STANDARD.md`.
- Do not equate a green build/deployment with successful hands-on acceptance. Never call an untested screen "live tested".
- Avoid sweeping automatic restyling and unreviewed deployment. Source/CI, backend-first gates, Hosting confirmation and actual device sign-off remain separate stages.
