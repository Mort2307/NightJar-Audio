# NightJar / Midnight Gold — approved visual direction

Status: **Design implementation branch — do not merge or deploy without an explicit release instruction**.

This is a functional design-system conversion, not a replacement for the app's security, subscriptions, profile privacy, release workflows, age assurance or moderation.

## Reference art direction

- Obsidian first: deep #080808 backgrounds, **not** brown backgrounds.
- Champagne gold #D9B574 / #E2C18B as selective accent, borders, icons, selected states and primary actions.
- Warm ivory #F5EFE5 for primary text; readable taupe #C4BAAB for secondary text.
- Elegant editorial serif display headings paired with restrained, legible system sans-serif body/UI text.
- Thin warm metallic outlines, almost-black layered cards, cinematic portrait treatment, soft gold pools of light.
- No pink, purple or blue as discretionary standard interface accents. Genre/release imagery may still contain other colours.
- Live user content always comes from approved NightJar assets; **never** pretend mockup sample content is real member content.

## Surface contracts

- Home / Spotlight: fixed Spotlight priority remains in place. Use gold-led release promotion.
- Discover / Directory: creator portraits and approved releases on near-black cards.
- Creator / Writer / Editor / Artist: compatible professional identity and published work layouts; retain all existing permissions.
- Public profile: real approved portrait used for subtle cover image, circular gold-framed avatar, a tappable official crescent that only appears on server-approved professional roles.
- Audio player: dark cinema sheet, gold controls, readable progress and transcript; playback and transcription remain independent.
- Library / Search / Messaging / Notifications / Settings / Admin: all use shared tokens; preserve context-specific error/danger signalling.
- Mobile: retain the five-slot nav, safe-area padding, keyboard focus and touch targets.

## Official moon semantics

The gold crescent is NOT an age assurance indicator and is NOT awarded for attribution on a single work. It marks a professional role returned by the protected public-profile service (which uses the account's approvedProfessionalRoles or existing active professional account role). Unprocessed listeners can receive writing, editing, art or voice credits without receiving the crescent.

Do not derive approval from untrusted upload metadata, a client-set profile bio, a generic credit label, or passing Didit.

## Accessibility override contract

Midnight Gold is the fixed standard appearance but **Vision Access wins over brand styling** for users needing clarity, paper, focus or soft-contrast palettes, larger text, screen magnification and reduced motion. Never remove or hide Vision Access. Respect prefers-reduced-motion, high contrast, forced colours, keyboard access, text labels and screen readers. Gold-only text cues must also have a semantic text or icon label.

## Validation / handover

The redesign is currently scoped to a separate branch only. Before a live merge, run:
```sh
npm ci --no-fund
npm run typecheck
npm run validate
```
Then manually inspect responsive screens at 320px, 375px, 430px, tablet and desktop; all four Vision Access palettes, 200% scaling, TalkBack / VoiceOver, keyboard tab order, reduced motion, popovers, player controls, profile privacy and Didit/auth flows.

**Deployment gate:** opening a PR triggers the NightJar Firebase *preview* workflow; merging into main triggers *production Hosting*. Neither is part of this design preparation. Only open/merge/deploy after the owner explicitly authorises the next phase.
