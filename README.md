# Nightjar

Premium immersive audio for adults.

## Source of truth

GitHub is the canonical source repository for Nightjar.

- Repository: https://github.com/Mort2307/NightJar-Audio
- Current source-of-truth branch: `main`
- Original prototype baseline imported from the earlier runtime and preserved only as migration history

## Hosting

Firebase Hosting is the intended public/tester frontend. GitHub `main` is the source of truth, with Firebase Authentication, Cloud Functions and Firestore as the production platform.

Target public domain:

**https://nightjar.audio**

The custom domain is configured in Firebase Hosting rather than `firebase.json`. The domain must be owned/controlled by the Nightjar team and its DNS records pointed at the Firebase Hosting site.

Build:

```powershell
npm install
npm run build:firebase
```

## Security model

Protected manuscripts use backend authorization, short-lived reader sessions, access expiry/revocation, identity-bound evidence, repeated session/account/script provenance watermarks, browser interaction restrictions, device-token correlation and suspicious-activity signals.

Writers remain in control of their own work. A writer can explicitly grant a VA, creator, editor or collaborator full-script access and independently allow copy/export, set an expiry, or revoke the grant. Writer-authorised copy/export is logged as authorised activity rather than treated as theft.

A browser application cannot reliably detect screenshots, screen recording, OCR, or determined extraction. Nightjar therefore uses attribution and retained access evidence rather than pretending screenshots can always be detected. Security signals are evidence for review, not proof of wrongdoing.

Qualifying suspicious protected-content activity creates a retained security alert addressed to **all three configured Nightjar owners**. The response is graduated: administrators can close activity as benign, revoke protected-reader sessions while leaving the account active, or explicitly suspend the account. A single screenshot-like or blocked interaction does not automatically freeze an account.

IP/network reputation can later be added at the trusted edge when request metadata is available. Nightjar must not treat an IP address as a person or use IP alone as the basis for permanent account action; shared networks, mobile carriers, VPNs and dynamic addressing make that unsafe.

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

Age-assurance callback/cancel URLs must resolve to the Firebase/custom-domain deployment. Production configuration should use `https://nightjar.audio/` once that domain is verified.


## Age assurance — mandatory for all accounts

Nightjar requires a **live Didit 18+ verification once per authenticated Firebase account**, including existing closed-beta testers, administrators and professional contributors. Closed-beta allowlisting controls who may register but NEVER substitutes for age verification. No bypass or fake admin approval unlocks adult content.

- Sign in and verify the email, then complete one Didit check **before** accessing the catalogue or continuing role/profile onboarding.
- The user expressly presses **Verify my age with Didit**. Sign-ins, background refresh and account creation never start a billable session.
- The backend saves an approved **live** Didit decision only where an ID-verification check confirms the user was at least 18; a generic `Approved` identity result or sandbox result cannot unlock adult content.
- The verified status is persisted in Firestore under `ageAssurance/<uid>` and reused on future logins and devices. It remains valid until explicit provider revocation or a justified safeguarding/security review.
- Sessions still pending are reused instead of being duplicated. A provider-review status blocks a second paid check, and new sessions have a cap of three starts per account per 24-hour window.
- Signature-verified, replay-protected Didit V3 webhooks update verification records asynchronously. Raw ID images and biometrics are not saved in Nightjar.
- Protected audio, transcripts, scripts and Nightjars gifting require this server-side live approval.

**Required Firebase Secret Manager values**: `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_ENVIRONMENT=live`. The workflow must require real documentary adult evidence with a verified date of birth; a facial-estimation-only adaptive path cannot grant access until a separately reviewed evidence adapter is added. Configure the V3 webhook destination to `https://nightjar.audio/api/webhooks/didit` with `status.updated`, `data.updated`, and `user.status.updated`. Confirm the final callback hostname maps to the deployed Firebase function.

Use `npm run setup:didit:live` from an authenticated Cloud Shell terminal to configure **secrets without exposing them in code or chat**. This setup does not deploy or certify the integration. Run the standard repo validation, deploy Functions and Hosting, then perform a supervised successful 18+ approval and under-18/decline test before accepting real testers. Until then the new gate intentionally fails closed. A sandbox approval is not a live 18+ verification.

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


## Production account identity

Nightjar now contains a Firebase Authentication account client for email/password registration, persistent sign-in, email verification/resend, password reset and reauthenticated password changes.

Firebase is now the active Nightjar runtime foundation. Callable Firebase Functions receive Firebase Authentication context, protected operations use the verified Firebase `uid`, and the active frontend no longer depends on the previous local/AppDeploy compatibility client. Production age assurance remains intentionally fail-closed until a highly effective provider is configured.

Required production flow:

```text
Firebase email/password account
        ↓
verified email
        ↓
Firebase ID token
        ↓
Nightjar trusted backend token verification
        ↓
verified uid → Nightjar account / role / suspension
        ↓
age assurance
        ↓
subscription / explicit content permission
        ↓
protected content
```

Archived AppDeploy/local-runtime files live under `legacy/appdeploy/` solely as migration reference. They are not imported by the active application and are not part of the production runtime.

## Persistent user settings and moderated imagery

Nightjar treats user-visible changes as persistent account data. Profile identity, headline, bio, welcome message, declared taste, role focus, visibility and approved imagery are stored against the verified Firebase UID and remain editable. Optional text can be cleared and saved again.

All user-uploaded images follow one moderation pipeline:

1. PNG, JPG or WebP only; binary signatures are checked server-side.
2. The image is stored privately in Firebase Storage with no direct browser read access.
3. The image is recorded as `pending` in Firestore.
4. Administrators receive a temporary review URL in the Image Moderation queue.
5. Approval requires an explicit administrator review for nudity, explicit sexual imagery and other unsuitable imagery.
6. Only an approved asset is exposed through Nightjar's approved-image HTTP endpoint.
7. Rejection deletes the stored image bytes. User/admin removal marks the asset removed and the public endpoint stops serving it.

This applies to profile pictures, Nightjar branding/logo uploads and release artwork. SVG uploads are intentionally not supported.

Approved profile, logo and release artwork remains live while a replacement is pending. A rejected replacement does not remove the previously approved image.

## Commercial controls

Commercial planning values live in the Firebase `settings/commercial` record and can be edited or cleared by an administrator. This includes planning monthly price, creator-pool percentage, operating reserve, payout cadence and eligible-listening definition.

Confirmed subscription counts and confirmed gross MRR are read from Firebase billing records. Confirmed MRR is the sum of explicit `confirmedMonthlyAmountPence` values on active subscriptions; Nightjar does not infer confirmed revenue by multiplying a planning price.

## Audio Editor role

The internal role key remains `editor` for permission compatibility, while the user-facing role is **Audio Editor**. Administrators can assign this role from the Firebase-backed account directory. Active Audio Editors with public profiles participate in the deterministic daily Audio Editor Spotlight without exposing protected editorial assignments or manuscript content.

## Private audio and catalogue

Creator release drafts, metadata and catalogue state are stored in Firestore. Release audio is stored privately in Firebase Storage under the verified Creator UID. Storage rules deny all direct reads. A Creator may upload or replace only their own supported audio objects, with a 25 MB limit, and the trusted backend validates the final Storage path, MIME type and object size.

Listeners never receive a permanent public audio URL. Playback requires an active Firebase account plus recorded age assurance, then Nightjar issues a short-lived signed playback URL. Administrator moderation uses a separate short-lived preview URL.

Draft audio, approved/pending release artwork and other owned media are deleted when the associated removable draft is deleted so Nightjar does not intentionally leave orphaned user media behind.

## Manuscripts and protection

Writer manuscripts, saved versions, Audio Editor assignment/review state, explicit full-script permissions, reader sessions, protection evidence, reports and security alerts are stored in Firestore.

Full-script access remains writer-controlled. Copy/export permissions and optional expiry are explicit and revocable; revocation closes active protected-reader sessions. Browser screenshot detection is not treated as reliable. Protected views use visible session/account/script provenance plus retained platform evidence instead.

Protected-content signals remain evidence rather than guilt. Nightjar's graduated score creates an administrator-review alert at 40+, with High at 60+ and Critical at 85+. The backend records `automaticAction: none` and `reviewRequired: true`; accounts are not automatically frozen from these signals. Administrators can close an alert as benign, revoke reader sessions, or explicitly suspend the account.

## Age assurance

Age-assurance state is stored in Firebase and protected catalogue/playback endpoints verify it server-side. The production provider is not configured by this repository yet, so normal age-assurance initiation fails closed rather than simulating a production pass. Allowlisted administrators retain a controlled test-pass path for development only.

## Social follows and verified listening

Follows are account-to-account relationships stored under the verified Firebase UID. A user can follow multiple active public Nightjar profiles across Creator, Writer, Audio Editor and Listener roles. Following one profile never replaces another. Self-follow, administrator profiles and private profiles are rejected by the backend. Target profiles maintain a transactional follower count so repeated follow requests do not double-count.

Nightjar uses one bounded verified-listening calculation for Creator Studio metrics, creator listening-share displays and weekly Listener Spotlight ranking. It credits only forward playback progress and bounds credit by elapsed wall time plus a small tolerance and a per-event ceiling. Cumulative player positions, large seek jumps and rapid event spam are not counted as if they were continuous listening.

### Private creator audio

Creator audio is stored privately under `release-audio/{firebaseUid}/{releaseId}/...`. Browser reads are denied. Storage rules allow creation only when the authenticated account is an active Creator, the referenced Firestore release exists, belongs to that Creator, is still editable, the MIME type is supported and the file is no larger than 25 MB. The backend re-validates path ownership, MIME type and size before attaching the upload to the release.

Released audio is played through short-lived signed URLs issued by a callable Function only after server-side age assurance succeeds. Administrator moderation previews use separate short-lived signed URLs.

### Public profiles

Every active non-admin Nightjar role can have a public profile. Creator and Writer surfaces may add role-specific context, while the generic public profile supports Listener and Audio Editor discovery without exposing private listening history, editorial assignments, manuscript data or account credentials.

Profiles marked private are not returned by the public profile endpoint and cannot receive new follows through the public follow API. Optional handles can be changed or removed; clearing a handle transactionally releases its uniqueness reservation.

### Adult-content boundary

Catalogue discovery, recommendations, trending, creator/writer discovery, spotlight state, audio playback and protected manuscript listing/opening all enforce age assurance in Firebase Functions. UI gating is not treated as the security boundary.
