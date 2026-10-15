import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts','utf8');
const client = fs.readFileSync('src/platform/firebase-media.ts','utf8');
const config = JSON.parse(fs.readFileSync('firebase.json','utf8'));
const section = (start,end) => {
  const at=backend.indexOf(start);
  const stop=backend.indexOf(end,at+start.length);
  assert.ok(at>=0 && stop>at,'Found backend section: '+start);
  return backend.slice(at,stop);
};

const approved = section('export const approvedImage = onRequest','export const brandLogoImage = onRequest');
const logo = section('export const brandLogoImage = onRequest','const streamBrandingIcon = async');
const icons = section('const streamBrandingIcon = async','export const brandIcon192=');
const manifest = section('export const brandInstallManifest = onRequest','export const syncBrandIconVariants = onCall');
const privatePreview = section('export const getPendingImagePreview = onCall','export const listPendingImages = onCall');
const publisher = section('export const publishScheduledReleases = onSchedule','export const adminAccountOverview = onCall');

assert.match(approved,/asset.status !== 'approved'/,'unmoderated image assets must be rejected');
assert.match(approved,/public,max-age=30,s-maxage=30,must-revalidate/,'approved images have a short browser/cache reuse period');
assert.match(approved,/createReadStream\(\)/,'approved image delivery remains streamed');
assert.match(logo,/branding.logoStatus !== 'approved'/,'logo must remain moderation-gated');
assert.match(logo,/asset.status !== 'approved'/,'logo assets remain moderation-gated');
assert.match(logo,/public,max-age=60,s-maxage=60,must-revalidate/,'approved logo avoids immediate duplicate delivery');
assert.match(icons,/branding.logoStatus==='approved'/,'app icons require an approved logo');
assert.match(icons,/public,max-age=120,s-maxage=120,must-revalidate/,'icons can be reused for a short period');
assert.match(manifest,/no-store,max-age=0,must-revalidate/,'dynamic PWA manifest always reflects latest icon version');
assert.match(manifest,/\?v='\+version/,'changed icon versions bypass old browser-cache entries');
assert.doesNotMatch(privatePreview,/Cache-Control.*public|max-age=30/,'private image previews must never be added to public cache');
assert.match(privatePreview,/requireAdminIdentity\(request\)/,'private moderation previews remain admin-only');
assert.match(privatePreview,/status !== 'pending'/,'private previews must remain pending-only');
assert.match(publisher,/schedule:'every 1 minutes'/,'cost optimization must not degrade minute-accurate scheduled publication');

const hostingIcons = config.hosting.headers.find(item=>item.source==='/app-icons/**');
assert.ok(hostingIcons,'Firebase Hosting must declare the icon cache policy');
assert.equal(hostingIcons.headers.find(h=>h.key==='Cache-Control')?.value,
  'public,max-age=120,s-maxage=120,must-revalidate','Hosting and Cloud Function icon cache policies must match');
const hostingManifest = config.hosting.headers.find(item=>item.source==='/app-manifest.webmanifest');
assert.match(hostingManifest.headers.find(h=>h.key==='Cache-Control')?.value??'',/no-store/,'PWA manifest remains uncached');

assert.match(client,/BRANDING_CACHE_MS = 90_000/,'public metadata has short cache lifetime');
assert.match(client,/if \(brandingRequest\) return brandingRequest/,'simultaneous UI requests reuse one callable');
assert.match(client,/if \(generation === brandingGeneration\)/,'late replies cannot restore invalidated cache');
assert.match(client,/nightjar:branding-changed/,'live in-app branding changes invalidate the cache');
assert.match(client,/nightjar.branding.version/,'cross-tab branding changes invalidate the cache');
assert.match(client,/invalidateBranding\(\)/,'admin mutations invalidate cached branding metadata');

console.log('NightJar Cloud Run image egress and moderation-safe caching contracts passed.');
