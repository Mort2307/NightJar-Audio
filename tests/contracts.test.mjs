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

test('local shim mirrors critical social, taste and moderation contracts', () => {
  assert.match(shim, /\/api\/following/);
  assert.match(shim, /tasteSignalWeight/);
  assert.match(shim, /diversifyReleases/);
  assert.match(shim, /moderationHistory/);
  assert.match(shim, /Unsupported taste signal/);
  assert.match(shim, /parts\.length === 5 && parts\[4\] === 'assign-editor'/);
  assert.equal((shim.match(/path === '\/api\/editor\/accounts'/g) ?? []).length, 1);
});
