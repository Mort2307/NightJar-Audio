# NightJar verified closed-beta listener access — release acceptance

## Root cause
The actual protected audio URL and its listings only recognise an administrator, the release creator/credited contributor, or a paid subscriber. Testers have account-level `testAccess` or an approved `closedBetaAllowlist` email, but **no listener entitlement**. This makes their own work playable while other creators' published work is blocked.

## Entitlement, not payment
A member can listen for free during the beta only when ALL are true: `CLOSED_BETA` is enabled, authenticated email matches their current account, the account is not suspended, the account has an existing owner-approved tester permission, and its own durable signed **live Didit Verified 18+** result remains valid. This does not set or simulate a billing subscription. Ordinary listeners and public launch stay subject to verified real payments or approved credits.

## Protected media
The release still must have `status=released`, an audio path, and any published Studio Notes parent checks. Ownership/approved credits and paid entitlements are unchanged. Protected drafts, scheduled releases, rejected content, and private transcripts remain restricted.

## Read-only regression and device acceptance
- [ ] Real verified approved tester can play another creator's approved release from Listener home, creator profile, search, trending and saved library.
- [ ] Existing signed audio grants and lock screen playback work; transcripts follow the same entitlement.
- [ ] Member with no approved tester flag and no paid subscription remains locked.
- [ ] Unverified (or revoked) tester remains locked despite beta allowlist.
- [ ] Suspended or mismatched-account identity remains locked.
- [ ] Paid subscriber and credited collaborator retain existing access.
- [ ] Unpublished, removed, scheduled, unapproved or unlinked Studio Notes audio remains protected.
- [ ] No payment record, subscription, KYC result, messages or roles are changed.
- [ ] Turning `CLOSED_BETA` off eliminates this entitlement; ordinary paid entitlements remain.

## Release
CI must pass with the compatible Functions dependency security repair from PR #321; the old six moderate advisories must NOT be silenced. `[nightjar-beta-listening-release]` dispatches only selected backend readers and waits on their successful authenticated WIF release before Hosting. If the backend workflow cannot deploy, do not claim live playback is fixed. Manual playback acceptance remains outstanding until tested with existing consenting verified beta accounts.
