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


## Age assurance

Nightjar uses **account-level 18+ age assurance**. A successful provider result is stored against the authenticated Nightjar account and reused on later logins and devices. A new provider session is created only when the account has no verified result or an explicit re-verification requirement is recorded.

Production Yoti integration is **not connected**. `AGE_ASSURANCE_CONFIGURED` remains false and ordinary accounts fail closed. Administrators and active accounts explicitly granted tester access can use a clearly labelled temporary bypass while public access is locked. Test records are never treated as Yoti results, and the bypass stops working when production assurance is configured. No public launch is allowed before provider callbacks are authenticated and verified end to end.

The catalogue, listening and playback endpoints enforce age assurance and the server-side entitlement gate. A browser-side payment-success redirect cannot grant access.

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

Commercial planning values live in the Firebase `settings/commercial` record and can be edited or cleared by an administrator. This includes planning monthly price, operating reserve, payout cadence, capped equal creator-rate bands and creator eligibility.

Confirmed subscription counts and confirmed gross MRR are read from Firebase billing records. Confirmed MRR counts only current, provider-verified active subscriptions with an explicit positive `confirmedMonthlyAmountPence`. Planning price and demo records do not grant entitlements.

## Audio Editor role

The internal role key remains `editor` for permission compatibility, while the user-facing role is **Audio Editor**. Administrators can assign this role from the Firebase-backed account directory. Active Audio Editors with public profiles participate in the deterministic daily Audio Editor Spotlight without exposing protected editorial assignments or manuscript content.

## Private audio and catalogue

Creator release drafts, metadata and catalogue state are stored in Firestore. Release audio is stored privately in Firebase Storage under the verified Creator UID. Storage rules deny all direct reads. A Creator may upload or replace only their own supported audio objects, with a 25 MB limit, and the trusted backend validates the final Storage path, MIME type and object size.

Listeners never receive a permanent public audio URL. Playback requires an active Firebase account, production age assurance and a current provider-verified paid subscription. While public access is locked, explicitly approved testers can use a temporary test entitlement. Nightjar then issues a short-lived signed playback URL. Administrator moderation uses a separate short-lived preview URL.

Draft audio, approved/pending release artwork and other owned media are deleted when the associated removable draft is deleted so Nightjar does not intentionally leave orphaned user media behind.

## Manuscripts and protection

Writer manuscripts, saved versions, Audio Editor assignment/review state, explicit full-script permissions, reader sessions, protection evidence, reports and security alerts are stored in Firestore.

Full-script access remains writer-controlled. Copy/export permissions and optional expiry are explicit and revocable; revocation closes active protected-reader sessions. Browser screenshot detection is not treated as reliable. Protected views use visible session/account/script provenance plus retained platform evidence instead.

Protected-content signals remain evidence rather than guilt. Nightjar's graduated score creates an administrator-review alert at 40+, with High at 60+ and Critical at 85+. The backend records `automaticAction: none` and `reviewRequired: true`; accounts are not automatically frozen from these signals. Administrators can close an alert as benign, revoke reader sessions, or explicitly suspend the account.

## Age assurance

Age-assurance state is stored in Firebase and protected catalogue/playback endpoints verify it server-side. The production provider is not configured by this repository yet, so normal age-assurance initiation fails closed rather than simulating a production pass. Allowlisted administrators and explicitly granted active testers retain controlled, audited temporary access for development only. The Admin launch panel shows current tester grants and the missing production gates.

## Social follows and verified listening

Follows are account-to-account relationships stored under the verified Firebase UID. A user can follow multiple active public Nightjar profiles across Creator, Writer, Audio Editor and Listener roles. Following one profile never replaces another. Self-follow, administrator profiles and private profiles are rejected by the backend. Target profiles maintain a transactional follower count so repeated follow requests do not double-count.

Nightjar uses one bounded verified-listening calculation for Creator Studio metrics, creator listening-share displays and weekly Listener Spotlight ranking. It credits only forward playback progress and bounds credit by elapsed wall time plus a small tolerance and a per-event ceiling. Cumulative player positions, large seek jumps and rapid event spam are not counted as if they were continuous listening.

### Private creator audio

Creator audio is stored privately under `release-audio/{firebaseUid}/{releaseId}/...`. Browser reads are denied. Storage rules allow creation only when the authenticated account is an active Creator, the referenced Firestore release exists, belongs to that Creator, is still editable, the MIME type is supported and the file is no larger than 25 MB. The backend re-validates path ownership, MIME type and size before attaching the upload to the release.

Released audio is played through short-lived signed URLs issued by a callable Function only after server-side age assurance and subscription entitlement succeed (or the pre-launch temporary test path applies). Administrator moderation previews use separate short-lived signed URLs.

### Public profiles

Every active non-admin Nightjar role can have a public profile. Creator and Writer surfaces may add role-specific context, while the generic public profile supports Listener and Audio Editor discovery without exposing private listening history, editorial assignments, manuscript data or account credentials.

Profiles marked private are not returned by the public profile endpoint and cannot receive new follows through the public follow API. Optional handles can be changed or removed; clearing a handle transactionally releases its uniqueness reservation.

### Adult-content boundary

Catalogue discovery, recommendations, trending, creator/writer discovery, spotlight state, audio playback and protected manuscript listing/opening all enforce age assurance in Firebase Functions. UI gating is not treated as the security boundary.


## Production architecture status

Nightjar is a web-first mobile and desktop product. The current PWA manifest and responsive app are the primary experience. The player supports lock-screen Media Session controls where the browser supports them, 15-second seeking, saved volume and speed, and touch-friendly mobile controls. Protected audio is not added to an offline service-worker cache.

The payment provider is **not selected or connected**. There is no Stripe integration in the active source. Before billing is enabled, an adult-compatible processor must be underwritten for Nightjar's audio-only model and its fees, refunds, chargebacks, international creator payouts and tax responsibilities agreed in writing. Provider-authenticated webhooks will create UID-keyed `subscriptions/{uid}` records with `userId`, `status`, `providerVerified`, `billingProvider`, `providerSubscriptionId`, `confirmedMonthlyAmountPence` and `currentPeriodEnd`. The backend entitlement gate ignores client redirects and planning settings.

Creator compensation remains a capped equal standard rate. Listening activity informs analytics and discovery but does not change an individual's base rate. Payout accruals need a versioned accounting ledger before any real creator payments are approved. Independent creators normally manage their own personal taxes, subject to applicable withholding/reporting obligations and a professional review of the final agreements.

Public launch is locked. Outstanding gates include live age assurance and callback verification, processor webhook integration and reconciliation, cleared tester grants, admin MFA/capabilities, App Check and rate limits, privacy/export/deletion flows, community reporting/appeals, image re-encoding, a resumable/transcoded audio pipeline, and emulator-backed role/security tests. CI currently verifies frontend and Functions builds plus the entitlement policy tests; this list is not a claim that those remaining controls are complete.
