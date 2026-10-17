import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const media = readFileSync('src/platform/firebase-media.ts', 'utf8');
const backend = readFileSync('functions/src/index.ts', 'utf8');

assert.match(media, /BRANDING_CACHE_MS = 90_000/, 'Only short-lived public branding metadata is cached');
assert.match(media, /if \(brandingRequest\) return brandingRequest/, 'Concurrent branding reads are coalesced');
assert.match(media, /generation === brandingGeneration/, 'Late results cannot repopulate invalidated metadata');
assert.match(media, /finally \{ if \(brandingRequest === pending\) brandingRequest = null; \}/);
assert.match(media, /event.key === 'nightjar.branding.version'/, 'Other tabs invalidate stale public metadata');
assert.match(media, /window\.localStorage\.setItem\('nightjar.branding.version'/, 'Admin updates broadcast the cache generation');
assert.match(media, /announceBrandingChange\(\)/, 'Admin branding mutations invalidate local metadata');
assert.match(media, /pendingPreview\(assetId: string\) \{\s*return \(await pendingPreviewCall/, 'Private moderation data stays uncached');
const publicImages = backend.slice(backend.indexOf('export const approvedImage = onRequest'), backend.indexOf('export const brandLogoImage = onRequest'));
assert.match(publicImages, /no-store,max-age=0/, 'Approved artwork stays no-store to preserve immediate takedown');
assert.doesNotMatch(publicImages, /public,max-age=30/, 'Never trade immediate moderation removal for marginal egress savings');
console.log('Public-only branding cache; no-store moderated artwork contracts PASS');
