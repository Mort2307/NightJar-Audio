# Admin manuscript review – contact Writer and synopsis (22 October 2026)

## Reproduction evidence
Real Android recording shows Admin review of an uploaded manuscript. The queue states "Writer has not selected marketplace visibility" while a separate fact row says "Marketplace synopsis: Missing." Tapping **Direct message Writer** navigates from Admin towards Messages but ends up on Home.

## Confirmed source causes
- The Messages page and Firebase callable explicitly permit Admin accounts, but App.tsx's view guard only includes creative roles in its allowed perspectives. Real Admin is redirected Home upon navigating to Messages.
- A synopsis is manually supplied by the Writer within the marketplace metadata. Private or not-yet-selected marketplace visibility is not an outstanding public synopsis requirement, yet the review UI presents one as "Missing."

## Fix
- Align view guard with the existing Admin Messages UI and backend authorisation; keep Listener and read-only preview restrictions. The review button continues opening the actual professional Messages page for the requested Writer.
- Show **Not requested** for private manuscripts with no synopsis, **Saved privately** for unpublished synopsis, **Provided** for a requested public synopsis and **Missing — ask Writer** only when the Writer actually requested marketplace listing.
- Explain that a protected uploaded manuscript is not automatically copied or summarised into a public synopsis. The protected review viewer, exact rights approvals, and publication gate stay unchanged.
- Expose a clear **Message Writer in review thread** shortcut. The manuscript thread already supports Writer-visible messages without relying on separate direct-message eligibility; focus its composer.
- If a separate DM cannot be created because the Writer account is not eligible or authorised, show an actionable error pointing to the review thread rather than a generic failure.
- Source contract protects both routes, guards, and synopsis semantics.

## Still to verify manually
- Admin opens manuscript then **Direct message Writer**: actual Messages page opens, existing/new thread selects Writer, and user can send only when authorised.
- Return to review and **Message Writer in review thread**: focus appears on the composer and writer-visible message can be sent.
- Private manuscript has synopsis **Not requested**; marketplace requested + empty is **Missing**, and a saved synopsis appears without protected source exposure.
- Confirm in both desktop and Android APK/PWA; CI alone cannot certify real member delivery.
