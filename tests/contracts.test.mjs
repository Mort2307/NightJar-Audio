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
const securityReview = read('src/components/SecurityReviewPanel.tsx');
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
  assert.match(permissionRoute, /active Nightjar account/);
  assert.match(permissionRoute, /recipientUserId/);
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


test('protected scripts never return the manuscript body from metadata or editor APIs', () => {
  const scriptRoute = backend.slice(backend.indexOf("'GET /api/scripts/:scriptId':"), backend.indexOf("'POST /api/scripts/:scriptId/request-access':"));
  assert.match(scriptRoute, /publicScriptMetadata/);
  assert.match(scriptRoute, /return error\('Script not found\.', 404\)/);
  assert.doesNotMatch(scriptRoute, /return json\(\{script,/);
  const editorQueue = backend.slice(backend.indexOf("'GET /api/editor/queue':"), backend.indexOf("'GET /api/editor/accounts':"));
  assert.match(editorQueue, /publicScriptMetadata/);
  assert.doesNotMatch(editorQueue, /queue: scripts\.filter\([^\n]+\) \}/);
});

test('protected script reading is paged, short-lived and permission revalidated', () => {
  assert.match(backend, /GET \/api\/scripts\/:scriptId\/content/);
  assert.match(backend, /chunkProtectedContent/);
  assert.match(backend, /readerSessionStillAuthorized/);
  assert.match(backend, /15 \* 60_000/);
  assert.match(backend, /Superseded by a new protected reader session/);
  assert.match(app, /Next page/);
  assert.match(app, /Previous page/);
  assert.match(app, /browser only receives the page you are reading/);
});

test('rapid protected manuscript harvesting revokes the session', () => {
  assert.match(backend, /enforceProtectedPageRate/);
  assert.match(backend, /sameSession\.length < 18/);
  assert.match(backend, /sameScript\.length < 24/);
  assert.match(backend, /Protected reader rate limit exceeded/);
  assert.match(shim, /sameSessionPages\.length >= 18/);
});

test('writers explicitly control full-script handoff and can revoke it', () => {
  const accessManager = read('src/components/ScriptAccessManager.tsx');
  const writerStudio = read('src/components/WriterStudio.tsx');
  assert.match(backend, /GET \/api\/scripts\/:scriptId\/access/);
  assert.match(backend, /POST \/api\/scripts\/:scriptId\/permissions/);
  assert.match(backend, /recipientUserId/);
  assert.match(backend, /allowExport/);
  assert.match(backend, /GET \/api\/scripts\/:scriptId\/export/);
  assert.match(backend, /writer has not granted full-script export permission/i);
  assert.match(accessManager, /Full handoff \/ export/);
  assert.match(accessManager, /VA recording session/);
  assert.match(accessManager, /Revoke/);
  assert.match(writerStudio, /ScriptAccessManager/);
});

test('protected script exports are fingerprinted, watermarked and audited', () => {
  const accessManager = read('src/components/ScriptAccessManager.tsx');
  assert.match(backend, /createHash\('sha256'\)/);
  assert.match(backend, /scriptContentHash/);
  assert.match(backend, /SHA-256:/);
  assert.match(backend, /script_export/);
  assert.match(backend, /Your script was exported/);
  assert.match(app, /reader-watermark-layer/);
  assert.match(app, /data-nosnippet/);
  assert.match(accessManager, /RECENT ACCESS ACTIVITY/);
});

test('protected routes discourage indexing, caching and AI training crawlers', () => {
  const robots = read('public/robots.txt');
  const firebase = read('firebase.json');
  assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
  assert.match(robots, /User-agent: CCBot\nDisallow: \//);
  assert.match(robots, /User-agent: ClaudeBot\nDisallow: \//);
  assert.match(robots, /User-agent: Google-Extended\nDisallow: \//);
  assert.match(firebase, /private,no-store,max-age=0/);
  assert.match(firebase, /noindex,nofollow,noarchive,nosnippet,noimageindex/);
});

test('recipient permissions may be read-only, copy-enabled or explicitly exportable', () => {
  const accessManager = read('src/components/ScriptAccessManager.tsx');
  assert.match(accessManager, /Protected read-only/);
  assert.match(accessManager, /Protected read \+ copy/);
  assert.match(accessManager, /Full handoff/);
  assert.match(app, /copyAllowed/);
  assert.match(app, /exportAllowed/);
  assert.match(app, /Export full script/);
});


test('new manuscripts use non-enumerable identifiers and sensitive screens reject framing', () => {
  assert.match(backend, /id: 'script-' \+ randomUUID\(\)/);
  const firebase = read('firebase.json');
  assert.match(firebase, /"X-Frame-Options"/);
  assert.match(firebase, /"DENY"/);
  assert.match(firebase, /frame-ancestors 'none'/);
});

test('manuscript tools independently enforce the adult verification boundary', () => {
  const writerRoutes = backend.slice(backend.indexOf("'GET /api/writer/scripts':"), backend.indexOf("'GET /api/editor/accounts':"));
  assert.match(writerRoutes, /Age verification required before accessing adult manuscript tools/);
  const accessRoute = backend.slice(backend.indexOf("'GET /api/scripts/:scriptId/access':"), backend.indexOf("'POST /api/admin/creator-applications"));
  assert.match(accessRoute, /Age verification required before accessing adult manuscript tools/);
  assert.match(shim, /requireVerifiedAdult\(state, account\)/);
});

test('editor and admin script workflow responses are metadata only', () => {
  const queueRoute = backend.slice(backend.indexOf("'GET /api/editor/queue':"), backend.indexOf("'GET /api/editor/accounts':"));
  const assignRoute = backend.slice(backend.indexOf("'POST /api/admin/scripts/:scriptId/assign-editor':"), backend.indexOf("'GET /api/admin/creator-applications':"));
  assert.match(queueRoute, /publicScriptMetadata/);
  assert.match(assignRoute, /publicScriptMetadata/);
  assert.doesNotMatch(queueRoute, /content:/);
  assert.doesNotMatch(assignRoute, /content:/);
  assert.match(backend, /Editorial assignment was reassigned/);
});

test('full handoff export states that AI training is not implicitly licensed', () => {
  assert.match(backend, /No AI training, dataset ingestion, automated extraction or redistribution/);
  assert.match(shim, /No AI training, dataset ingestion, automated extraction or redistribution/);
});


test('protected pages carry traceable forensic tokens without exposing a raw device identifier', () => {
  assert.match(backend, /securityDeviceTable/);
  assert.match(backend, /securityTokenHash\('nightjar-device'/);
  assert.match(backend, /pageForensicToken/);
  assert.match(backend, /forensicToken/);
  assert.match(backend, /GET \/api\/admin\/security\/trace\/:forensicToken/);
  assert.match(app, /getNightjarDeviceId/);
  assert.match(app, /deviceId=/);
  assert.match(app, /FORENSIC FP/);
  assert.match(securityReview, /Trace a leaked screenshot/);
  assert.match(shim, /localForensicToken/);
  assert.match(shim, /securityDevices/);
});

test('security alerts require human account action and fan out to all approved administrators', () => {
  const alertHelper = backend.slice(backend.indexOf('const createSecurityAlert'), backend.indexOf('const assessProtectedActivity'));
  assert.match(alertHelper, /automaticAccountFreeze: false/);
  assert.match(alertHelper, /createOwnerSecurityNotifications/);
  assert.match(backend, /for \(const email of ADMIN_EMAILS\)/);
  assert.doesNotMatch(alertHelper, /status:'suspended'|status: 'suspended'/);
  assert.match(securityReview, /does not automatically freeze accounts/);
  assert.match(securityReview, /Benign/);
  assert.match(securityReview, /Restore/);
});

test('blocked or previously suspended device reuse pauses protected access rather than silently creating another reader session', () => {
  assert.match(backend, /registerProtectedDevice/);
  assert.match(backend, /linkedSuspendedUserIds/);
  assert.match(backend, /Protected-script access is paused for security review/);
  assert.match(backend, /blocked_device_reader_attempt/);
  assert.match(securityReview, /Block device/);
  assert.match(shim, /Protected-script access is paused for security review/);
});

test('administrators can revoke reader access, freeze, restore, remove or classify an alert as benign', () => {
  assert.match(backend, /revoke_sessions/);
  assert.match(backend, /freeze_account/);
  assert.match(backend, /restore_account/);
  assert.match(backend, /remove_account/);
  assert.match(backend, /block_device/);
  assert.match(backend, /state: action/);
  assert.match(securityReview, /Revoke reader/);
  assert.match(securityReview, /Remove account/);
  assert.match(shim, /admin_security_action/);
});

test('ordinary browser focus changes are not treated as screenshot evidence', () => {
  assert.doesNotMatch(app, /visibilitychange[^\n]{0,200}recordProtectionEvent/);
  assert.doesNotMatch(app, /blur[^\n]{0,200}recordProtectionEvent/);
  assert.doesNotMatch(backend, /screenshot_detected/);
});


test('administrator security alerts surface through the normal notification bell', () => {
  assert.match(backend, /POST \/api\/security\/notifications\/:notificationId\/read/);
  assert.match(app, /securityOwnerNotification/);
  assert.match(app, /\/api\/security\/notifications/);
  assert.match(app, /Community & security updates/);
  assert.match(app, /item\.type === 'security_alert'/);
  assert.match(shim, /path === '\/api\/security\/notifications'/);
});

test('frozen and removed accounts are rejected by central adult and role guards', () => {
  assert.match(backend, /if \(await isSuspended\(userId\)\) return false/);
  assert.match(backend, /account\.status !== 'suspended'/);
  assert.match(backend, /account\.removed !== true/);
  assert.match(backend, /status: 'active' \| 'pending_review' \| 'suspended'/);
  assert.match(shim, /function requireActiveLocalAccount/);
  assert.match(shim, /account\.status === 'suspended' \|\| account\.removed === true/);
  assert.match(app, /This account is frozen while a Nightjar security review is active/);
  assert.match(app, /This account has been removed from Nightjar after administrator review/);
});


test('security-forced sign-out cannot fall through into age assurance', () => {
  assert.match(app, /if \(!auth\.isSignedIn\(\)\) \{\s*setAgeStage\('gate'\);\s*return true;/);
});


test('account session registration flags restricted-device reuse without auto-freezing the new account', () => {
  const routeStart = backend.indexOf("'POST /api/security/device/register':");
  const routeEnd = backend.indexOf("'POST /api/security/reader-session':", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = backend.slice(routeStart, routeEnd);
  assert.match(route, /device_linked_to_restricted_account/);
  assert.match(route, /securityReviewRequired/);
  assert.doesNotMatch(route, /status:\s*'suspended'/);
  assert.match(app, /\/api\/security\/device\/register/);
  assert.match(app, /registerCurrentSecurityDevice/);
  assert.match(shim, /path === '\/api\/security\/device\/register'/);
});

test('security review receives evidence summaries, linked accounts and case history', () => {
  assert.match(backend, /evidenceSummary/);
  assert.match(backend, /linkedAccounts/);
  assert.match(backend, /caseHistory/);
  assert.match(backend, /networkCorrelationAvailable:\s*false/);
  assert.match(securityReview, /Page views near alert/);
  assert.match(securityReview, /Linked accounts on the same device token/);
  assert.match(securityReview, /Recent evidence/);
  assert.match(securityReview, /Case history/);
  assert.match(shim, /evidenceSummary/);
  assert.match(shim, /linkedAccounts/);
});

test('destructive security actions require an administrator review note and have no legacy freeze shortcut', () => {
  assert.match(backend, /Add a review note before taking a destructive security action/);
  assert.match(shim, /Add a review note before taking a destructive security action/);
  assert.doesNotMatch(backend, /POST \/api\/admin\/security-alerts\/:alertId\/suspend/);
  assert.doesNotMatch(shim, /parts\[4\] === 'suspend'/);
});

test('nightjar does not pretend client supplied IP data is trustworthy security evidence', () => {
  assert.doesNotMatch(backend, /x-forwarded-for/i);
  assert.doesNotMatch(backend, /cf-connecting-ip/i);
  assert.doesNotMatch(backend, /clientIp|requestIp|remoteAddress/);
  assert.match(backend, /does not expose a trusted client-network address/);
  assert.match(securityReview, /device and forensic correlation|pseudonymous device and forensic correlation/i);
});

test('protected pages repeat the forensic watermark densely enough to survive ordinary cropping', () => {
  assert.match(app, /Array\.from\(\{ length: 18 \}\)/);
  assert.match(css, /reader-watermark-layer/);
  assert.match(app, /FORENSIC FP/);
});
