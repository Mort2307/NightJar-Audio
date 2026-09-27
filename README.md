# Nightjar

Premium immersive audio for adults.

## Source of truth

GitHub is the canonical source repository for Nightjar.

- Repository: https://github.com/Mort2307/NightJar-Audio
- Current source-of-truth branch: `main`
- Imported AppDeploy baseline: `import/appdeploy-current`

## Hosting

The intended public/tester frontend is Firebase Hosting. AppDeploy remains the development/QA environment until the deployment workflow is connected.

Target public domain:

**https://nightjar.audio**

The custom domain is configured in Firebase Hosting rather than `firebase.json`. The domain must be owned/controlled by the Nightjar team and its DNS records pointed at the Firebase Hosting site.

Build:

```powershell
npm install
npm run build:firebase
```

## Security model

Protected manuscripts use backend authorization, short-lived reader sessions, access expiry/revocation, identity-bound evidence, visible session watermarks, browser interaction restrictions, and suspicious-activity signals.

A browser application cannot guarantee prevention of screenshots, screen recording, OCR, or determined extraction. Security signals are evidence for review, not proof of wrongdoing.

Qualifying suspicious protected-content activity creates a retained security alert addressed to **all three configured Nightjar owners**. Administrator review can suspend the account and revoke active protected-reader sessions without deleting the evidence trail.

## Identity and Taste

All roles share the same profile model:

- chosen display name
- unique @handle
- headline and bio
- optional pronouns
- favourite tags
- favourite tropes
- favourite categories
- public-profile visibility
- role-specific focus

The Taste Engine separates identity from taste. Explicit preferences seed recommendations more strongly than inferred behaviour; behavioural signals refine the taste graph over time.

> Learn what someone likes. Don't infer who someone is.


### Runtime URL configuration

The backend uses `NIGHTJAR_APP_URL` for age-assurance callback/cancel URLs when configured. The AppDeploy URL remains the fallback for development; the Firebase/custom-domain deployment should set the runtime value to `https://nightjar.audio/`.


## Age assurance

Nightjar uses **account-level 18+ age assurance**. A successful provider result is stored against the authenticated Nightjar account and reused on later logins and devices. A new provider session is created only when the account has no verified result or an explicit re-verification requirement is recorded.

The backend is provider-ready for Yoti sandbox and production:

- `NIGHTJAR_AGE_ENV=sandbox` (default) uses Yoti's sandbox API and `YOTI_ACCESS_TOKEN`.
- `NIGHTJAR_AGE_ENV=production` uses Yoti's production Age API and `YOTI_API_KEY`.
- Both environments require `YOTI_SDK_ID`.
- `NIGHTJAR_APP_URL` controls the post-verification callback/cancel URL.

Nightjar stores verification state and an opaque provider reference. Raw identity documents are not stored in the Nightjar content database.

The adult catalogue, recommendations, trending releases and protected manuscript access are also checked server-side against the stored verified state, so the client cannot bypass the age gate.


## Inclusive spotlights

Nightjar's discovery page has three separate recognition lanes:

- **Creator Spotlight:** every active public Creator receives a deterministic full-day slot in roster order. The rotation is continuous: if there are fewer than seven Creators, the same roster simply cycles again with no empty days.
- **Writer Spotlight:** every active public Writer receives a deterministic full-day slot in roster order. The rotation is continuous: if there are fewer than seven Writers, the same roster simply cycles again with no empty days.
- **Listener Spotlight:** the previous completed Monday-Sunday week's top seven Listener accounts form a fixed weekly cohort; one is highlighted per day. If fewer than seven eligible listeners are in the cohort, the available listeners repeat across the seven days rather than creating empty slots, then a new cohort is selected for the next week.

Listener ranking uses tracked listening activity from the completed week and is deliberately frozen during the spotlight week so the highlighted cohort cannot reshuffle mid-week. Public-profile settings are respected when displaying individual community members.

Daily spotlight notifications are also materialized by the Nightjar background scheduler shortly after the Europe/London day boundary. The scheduler uses a short-lived GitHub Actions OIDC token bound to the Nightjar `main` workflow, and notification creation remains idempotent so schedule retries cannot send duplicate in-app notifications. The existing discovery request still performs the same idempotent materialization as a safety net when the scheduled job has not yet run.

## Core product modules

Nightjar keeps each major product surface in its own editable component so future feedback can be incorporated without turning the main application shell into a monolith:

- CreatorAudioPipeline.tsx handles real release metadata, audio/artwork upload, media duration detection, draft state and moderation handoff.
- NightjarPlayer.tsx handles playback, listening resume, progress/completion telemetry and queue navigation.
- CreatorProfile.tsx handles public creator discovery, released work, following and sharing.
- ContentModeration.tsx handles administrator review of submitted audio and metadata before publication.
- WriterDiscovery.tsx handles public writer discovery while keeping protected manuscripts private.
- NightjarOnboarding.tsx owns the explicit identity/taste question set, allowing the final compiled questions to evolve in one focused module.

The Taste Engine remains explicit-first: user-declared preferences are separate from identity and behavioural signals are used to refine discovery rather than infer personal identity.
