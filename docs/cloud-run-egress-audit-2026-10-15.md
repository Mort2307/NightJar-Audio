# NightJar Cloud Run egress audit — 15 October 2026

## Billing evidence and limitations

The owner's Google Cloud billing report for 1–14 October showed roughly **£0.09 net charges**, including **£0.08 attributed to Cloud Run Functions (europe-west2)**. A SKU view in a supplied recording identified roughly **£0.06 as internet data transfer within Europe**. This is an account-level cost breakdown, **not a per-function attribution**. No Cloud Run route-level metrics, traffic volume, request traces or billing export were available to prove which function caused the six pence. Do not ascribe these exact costs to the routes below.

GitHub Actions building and Firebase Hosting deployment do **not**, based on that evidence alone, explain the Cloud Run data-transfer SKU.

## Verified source-level hotspots

| Priority | Source | Finding | Handling |
|---|---|---|---|
| P1 | `approvedImage` in `functions/src/index.ts` | Every request for moderated public artwork streamed image bytes from Cloud Storage through Cloud Run with `no-store`. | This branch permits only 30s caching of approved artwork. Nonapproved images remain unavailable. |
| P1 | `brandLogoImage` | Each logo fetch could reread Firestore and proxy the approved image through Cloud Run. `no-store` prevented reuse. | 60s browser/intermediary cache; still requires an approved brand/logo record. |
| P1 | `brandIcon192`, `brandIcon512`, `brandIconMaskable512` | Icons streamed from Cloud Storage through Cloud Run with `no-store` both in Functions and Hosting headers. | Align both sets of headers to 120s caching; icon URLs already include `?v=<iconVersion>` to refresh after regeneration. |
| P1 | `getBranding` callable and UI | App and account portal request public branding metadata on mount/focus; simultaneous requests were not coalesced. | Reuse one in-flight callable; cache only public branding metadata in memory for up to 90s, invalidated for admin changes and cross-tab change events. |
| Investigate | `getPendingImagePreview` | Protected admin previews return up to 5 MiB image data as base64 (roughly 33% larger on the wire than binary). | **Not changed.** Requires protected direct-delivery design and revocation analysis; do not cache pending content publicly. |
| Investigate | `publishScheduledReleases` | Scheduled job checks for due releases once per minute; this can cause backend invocations even on quiet days. | **Not changed.** A slower schedule would degrade creator-selected release times. Benchmark Cloud Run/Firestore request metrics before redesign. |
| Lower priority | `listPublicProfiles`, `listCatalogue` | Large collection reads and callable payloads may scale with traffic. | **Not changed.** Pagination/projection requires end-to-end UX and access tests. |
| Positive | Signed audio URLs | Listener audio is supplied through signed Cloud Storage URLs, so the audio media bytes are not streamed through NightJar's Cloud Run callable itself. | Preserve this architecture and authorisation gate. |

## Safeguards

- All moderation checks remain in place before serving an image.
- The public approved-image cache is bounded to 30 seconds, a conscious trade-off: a previously fetched approved image might remain in a browser or intermediary cache for up to 30 seconds after removal. For instant emergency revocation, revert the image's cache policy to `no-store` or introduce a purgeable CDN/URL system. Do not increase this duration casually.
- Approved branding/logo caching permits up to 60 seconds, and app icons 120 seconds. The dynamic install manifest itself remains `no-store`.
- The new metadata cache stores no user identity, roles, payment details, authentication tokens, private previews or age-assurance status.
- Admin branding mutations invalidate in-memory cache. Another device without a change event may see old public branding metadata for up to 90 seconds.
- This branch changes HTTP headers in **deployed Cloud Functions** and `firebase.json` in Hosting. Deploy backend functions before or alongside Hosting, using the existing restricted `functions:selected` deployment workflow. Do not assume a Hosting-only deploy updates Cloud Run functions.
- Unrelated function/security changes should not be included in the release. The affected HTTP functions are `approvedImage`, `brandLogoImage`, `brandIcon192`, `brandIcon512`, `brandIconMaskable512`. The remaining brand-manifest and account functions need no update for this patch.

## Verification checklist

1. Run `npm run validate` and `npm --prefix functions run check`. The `cloud-run-egress-contracts.mjs` check is part of `validate:contracts`.
2. Use a preview deployment to confirm existing logos, icons and public artwork display; verify Android install icon changes still update after admin regeneration.
3. Verify a pending/rejected image cannot be fetched by `approvedImage`; verify deleted assets cease to work. A previously cached approved image may persist within the defined 30s period.
4. Inspect network response headers for `approvedImage`, `brandLogoImage` and `/app-icons/...` **after both backend and Hosting deploys**, including whether any intermediary overrides the policy.
5. In Google Cloud Billing, group by **SKU**, filter project `nightjar-audio`, and compare future **Cloud Run Functions network egress** over comparable test windows; report traffic and invocation counts as well as currency.
6. Set a budget and alerts. Budgets are notifications and do not inherently cap billable usage.
7. If costs persist, obtain per-service/function request counts and Cloud Run metrics first. Avoid guessing that the six pence was specifically caused by artwork, logo or scheduled release checks.

## Follow-up options (separate review/PR)

- Build an authenticated, short-lived direct download link for pending admin previews, with access/audit guarantees and no persistent public file URLs. This may **move** bytes to a different billable service rather than eliminate network transfer.
- For public approved images, investigate serving immutable, moderation-gated versioned assets from a CDN or Storage, with robust rapid takedown. Must preserve immediate moderation and link invalidation requirements.
- Keep the one-minute release schedule unless replacing it with an equivalently precise and cost-justified scheduling design that includes retries and access enforcement.
