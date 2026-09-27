import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const backend = read('backend/index.ts');
const app = read('src/App.tsx');
const shim = read('src/platform/appdeploy-local-shim.ts');
const moderation = read('src/components/ContentModeration.tsx');
const discovery = read('src/components/ProfileDiscovery.tsx');
const feedback = read('src/components/RecommendationFeedback.tsx');
const catalogueSearch = read('src/components/CatalogueSearch.tsx');
const creatorProfile = read('src/components/CreatorProfile.tsx');
const writerStudio = read('src/components/WriterStudio.tsx');
const creatorPipeline = read('src/components/CreatorAudioPipeline.tsx');
const css = read('src/index.css');

test('universal following is many-to-many and privacy guarded', () => {
  assert.match(backend, /GET \/api\/profiles/);
  assert.match(backend, /POST \/api\/follows\/:profileUserId/);
  assert.match(backend, /DELETE \/api\/follows\/:profileUserId/);
  assert.match(backend, /profileUserId === ctx\.user!\.userId/);
  assert.match(backend, /profile\?\.publicProfile/);
  assert.match(backend, /followIndexTable/);
  assert.match(backend, /ensureFollowIndexForUser/);
});

test('community UI uses account follow state rather than local save state', () => {
  assert.match(app, /ProfileDiscovery/);
  assert.match(app, /FollowingList/);
  assert.match(app, /followingProfileIds/);
  assert.doesNotMatch(app, /followingCreatorIds/);
  assert.doesNotMatch(app, /setSaved\(/);
  assert.match(discovery, /Follow as many public Nightjar profiles as you choose/);
  assert.match(app, />Community<\/button>/);
});

test('product data failures are isolated', () => {
  assert.match(app, /Promise\.allSettled/);
  assert.doesNotMatch(app, /setTracks\(\[\]\);\s*setCreatorDirectory\(\[\]\);/);
});

test('catalogue search is server backed and does not replace the master playback queue', () => {
  assert.match(backend, /ctx\.query\.q/);
  assert.match(backend, /ctx\.query\.category/);
  assert.match(backend, /catalogue, categories/);
  assert.match(app, /CatalogueSearch/);
  assert.match(app, /catalogueResults/);
  assert.match(app, /setCatalogueResults/);
  assert.match(catalogueSearch, /Search title, mood, trope, genre or tag/);
  assert.match(shim, /parts\[1\] === 'catalogue'/);
});

test('recommendation controls send explicit taste signals', () => {
  assert.match(feedback, /more_like_this/);
  assert.match(feedback, /less_like_this/);
  assert.match(feedback, /not_for_me/);
  assert.match(backend, /tasteSignalWeight/);
  assert.match(backend, /diversifyReleases/);
});

test('creator discovery is age gated', () => {
  const route = backend.slice(backend.indexOf("'GET /api/creators':"), backend.indexOf("'GET /api/spotlights':"));
  assert.match(route, /requireAuth\(\)/);
  assert.match(route, /isAgeVerified/);
  assert.match(route, /if \(!profile\?\.publicProfile\) return null/);
});

test('moderation decisions retain an audit trail', () => {
  assert.match(backend, /moderationHistoryTable/);
  assert.match(backend, /moderation-history/);
  assert.match(backend, /reasonCode/);
  assert.match(moderation, /Audit trail/);
  assert.match(moderation, /Decision reason/);
});

test('post-publication moderation can hold, restore and take down releases', () => {
  assert.match(backend, /release-library/);
  assert.match(backend, /POST \/api\/admin\/releases\/:releaseId\/lifecycle/);
  assert.match(backend, /'hold', 'restore', 'takedown'/);
  assert.match(backend, /status: toStatus/);
  assert.match(moderation, /Place on hold/);
  assert.match(moderation, /Take down/);
  assert.match(moderation, /Restore live/);
  assert.match(shim, /parts\[4\] === 'lifecycle'/);
});

test('verified listening is shared by creator metrics and listener spotlights', () => {
  assert.match(backend, /verifiedListeningSeconds\(listening\)/);
  assert.match(backend, /verifiedListeningSeconds\(userEvents\)/);
  assert.match(shim, /function verifiedListeningSeconds/);
  assert.match(shim, /verifiedListeningSeconds\(events\)/);
});

test('local adult-content routes enforce age verification parity', () => {
  assert.match(shim, /function requireVerifiedAdult/);
  assert.match(shim, /requireVerifiedAdult\(state, account\)/);
  assert.match(shim, /path === '\/api\/trending'/);
  assert.match(shim, /path === '\/api\/spotlights'/);
});

test('local shim mirrors critical social, taste and moderation contracts', () => {
  assert.match(shim, /\/api\/following/);
  assert.match(shim, /tasteSignalWeight/);
  assert.match(shim, /diversifyReleases/);
  assert.match(shim, /moderationHistory/);
  assert.match(shim, /Unsupported taste signal/);
  assert.match(shim, /parts\.length === 5 && parts\[4\] === 'assign-editor'/);
  assert.equal((shim.match(/path === '\/api\/editor\/accounts'/g) ?? []).length, 1);
});


test('keyboard and motion accessibility foundations are present', () => {
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(app, /preferredScrollBehavior/);
  assert.match(moderation, /aria-labelledby="release-moderation-title"/);
  assert.match(moderation, /event\.key === 'Escape'/);
  assert.match(creatorProfile, /aria-labelledby="creator-profile-title"/);
  assert.match(creatorProfile, /Close creator profile/);
});


test('creator release writes cannot bypass moderation state', () => {
  const createRoute = backend.slice(backend.indexOf("'POST /api/creator/releases':"), backend.indexOf("'PUT /api/creator/releases/:releaseId':"));
  const updateRoute = backend.slice(backend.indexOf("'PUT /api/creator/releases/:releaseId':"), backend.indexOf("'DELETE /api/creator/releases/:releaseId':"));
  assert.match(createRoute, /audioUrl: null/);
  assert.match(createRoute, /artworkUrl: null/);
  assert.doesNotMatch(updateRoute, /\.\.\.\(ctx\.body \?\? \{\}\)/);
  assert.match(updateRoute, /\['draft', 'rejected'\]/);
  assert.match(updateRoute, /status: release\.status/);
  assert.match(creatorPipeline, /const editable/);
  assert.match(creatorPipeline, /Submitted or live releases are locked/);
});

test('creator assets verify actual file signatures and integrity metadata', () => {
  assert.match(backend, /assetSignatureMatches/);
  assert.match(backend, /createHash\('sha256'\)/);
  assert.match(backend, /audioSha256/);
  assert.match(backend, /artworkSha256/);
  assert.match(backend, /audioBytes/);
  assert.match(backend, /artworkBytes/);
});

test('writer workflow fields cannot be mass assigned', () => {
  const updateRoute = backend.slice(backend.indexOf("'PUT /api/writer/scripts/:scriptId':"), backend.indexOf("'POST /api/writer/scripts/:scriptId/versions':"));
  assert.doesNotMatch(updateRoute, /\.\.\.\(ctx\.body \?\? \{\}\)/);
  assert.match(updateRoute, /Submitted or approved manuscripts are locked/);
  assert.match(updateRoute, /status: script\.status/);
  assert.match(updateRoute, /version: script\.version/);
  assert.match(writerStudio, /const editable/);
  assert.match(writerStudio, /read-only while it is submitted/);
});

test('protected manuscript catalogue never returns raw manuscript content', () => {
  const route = backend.slice(backend.indexOf("'GET /api/scripts/catalogue':"), backend.indexOf("'GET /api/scripts/:scriptId':"));
  assert.match(route, /activeAccess/);
  assert.match(route, /writerUserId === ctx\.user!\.userId/);
  assert.doesNotMatch(route, /content:/);
  assert.doesNotMatch(route, /return json\(\{ scripts: items/);
});

test('protected reader grants reject revoked and expired access', () => {
  assert.match(backend, /!item\.revokedAt/);
  assert.match(backend, /new Date\(String\(item\.expiresAt\)\)\.getTime\(\)>Date\.now\(\)/);
  assert.match(shim, /function localScriptGrant/);
  assert.match(shim, /grant\.revokedAt/);
});

test('script access requests derive writer ownership and validate grant recipients', () => {
  const requestRoute = backend.slice(backend.indexOf("'POST /api/scripts/:scriptId/request-access':"), backend.indexOf("'POST /api/scripts/:scriptId/permissions':"));
  const permissionRoute = backend.slice(backend.indexOf("'POST /api/scripts/:scriptId/permissions':"), backend.indexOf("'POST /api/admin/creator-applications"));
  assert.match(requestRoute, /script\.writerUserId/);
  assert.doesNotMatch(requestRoute, /body\.writerUserId/);
  assert.match(requestRoute, /Active Creator access required/);
  assert.match(permissionRoute, /active Creator/);
  assert.match(permissionRoute, /Access expiry must be a future date/);
  assert.match(permissionRoute, /No existing script access grant was found to revoke/);
  assert.match(shim, /accessGrants/);
});

test('editor reassignment closes stale access', () => {
  assert.match(backend, /closedReason: 'reassigned'/);
  assert.match(backend, /closedReason: body\.status/);
  assert.match(backend, /openAssignments/);
});

test('local profile and protection records are field allowlisted', () => {
  const profileRoute = shim.slice(shim.indexOf("if (path === '/api/profile/me' && method === 'PUT')"), shim.indexOf("if (parts[0] === 'api' && parts[1] === 'profile'"));
  const reportRoute = shim.slice(shim.indexOf("if (path === '/api/protection/report'"), shim.indexOf("if (path === '/api/security/reader-session'"));
  assert.doesNotMatch(profileRoute, /Object\.assign\(profile, input/);
  assert.match(profileRoute, /profile\.displayName/);
  assert.doesNotMatch(reportRoute, /userId: account\.userId, \.\.\.input/);
  assert.match(reportRoute, /reporterUserId: account\.userId/);
});
