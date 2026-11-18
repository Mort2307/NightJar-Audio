// Closed-beta access must never masquerade as genuine Didit age assurance.
// Source-level regression contract; no Firebase data or provider sessions are touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend=readFileSync('functions/src/index.ts','utf8');
const frontend=readFileSync('src/App.tsx','utf8');
const hosting=readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const deploy=readFileSync('.github/workflows/firebase-backend-deploy.yml','utf8');
const verifySource=readFileSync('scripts/firebase-backend-verify.mjs','utf8');
const helperStart=backend.indexOf('const requireGenuineAgeAssurance = async');
const helperEnd=backend.indexOf('\nexport const getReleasePlaybackUrl',helperStart);
assert.ok(helperStart>0 && helperEnd>helperStart,'protected-content access gate exists');
const helper=backend.slice(helperStart,helperEnd);
assert.match(helper,/diditPass\(data\)/,'genuine Didit approval is the only protected-content access path');
assert.doesNotMatch(helper,/temporaryAgeBypassFor\(uid\)/,'temporary beta admission must never unlock protected content');
assert.doesNotMatch(helper,/temporaryBypass|temporary-closed-beta-admission/,'protected-content gate must not accept or return beta-bypass state');
assert.match(helper,/genuine_age_assurance_required/,'unverified accounts fail closed with a stable age-assurance error');
assert.doesNotMatch(helper,/ageAssurance.*\.set\(/,'the protected-content gate never fabricates provider approval');

// General beta admission remains available for ordinary app and creator workflows.
const generalGateStart=backend.indexOf('const requireAgeVerified = async');
const generalGateEnd=backend.indexOf('\n// Protected adult audio',generalGateStart);
assert.ok(generalGateStart>0 && generalGateEnd>generalGateStart,'general beta admission gate exists separately');
const generalGate=backend.slice(generalGateStart,generalGateEnd);
assert.match(generalGate,/temporaryAgeBypassFor\(uid\)/,'approved beta testers retain general app access without Didit');
assert.match(generalGate,/TEMPORARY_ACCESS/,'general beta access remains clearly distinguishable from provider verification');
for(const name of [
  'getEditorPortfolioAudioUrl','getReleasePlaybackUrl','getReleaseSyncAudioUrl',
  'getReleaseTranscript','listProtectedScripts','openProtectedScript',
  'getMarketplaceScriptSample','recordListeningEvent',
  'getAdminReleasePreviewUrl','getAdminScriptReview',
  'listWriterScripts','createWriterScript','uploadWriterScriptFile','updateWriterScript',
  'createWriterScriptVersion','submitWriterScript','reviewEditorScript','adminListScripts',
  'adminReviewWriterScript','listManuscriptReviewThread','postManuscriptReviewEntry',
  'listScriptPermissions','setScriptPermission','updateScriptRightsAndListing',
  'adminPreviewScriptMarketplace','listScriptMarketplace','createScriptLicenceOffer',
  'listMyScriptLicenceOffers','respondScriptLicenceOffer','expressScriptInterest','adminAssignEditor',
  'createRelease','updateRelease','finalizeReleaseAudio','submitReleaseForModeration',
  'saveSyncedReleaseTranscript','adminReleaseAudioLibrary','releaseModerationQueue',
]){
  const start=backend.indexOf('export const '+name+' = onCall');
  assert.ok(start>0,'missing protected-content endpoint '+name);
  const next=backend.indexOf('\nexport const ',start+20);
  const body=backend.slice(start,next<0?undefined:next);
  assert.match(body,/requireGenuineAgeAssurance\(/,'protected feature requires genuine Didit approval: '+name);
}
const dashboardStart=backend.indexOf('export const creatorDashboard = onCall');
const dashboardEnd=backend.indexOf('\n});',dashboardStart)+4;
const dashboard=backend.slice(dashboardStart,dashboardEnd);
assert.match(dashboard,/requireGenuineAgeAssurance\(identity\.uid\)/,'creator dashboard full content requires genuine Didit age assurance');
assert.match(dashboard,/releaseOwnerPayload\(doc\.data\(\), doc\.id\)/,'creator dashboard returns full owner transcript content only after genuine age assurance');
const listening=backend.slice(backend.indexOf('export const myListeningAccess = onCall'),
  backend.indexOf('const professionalRolesForAccount',backend.indexOf('export const myListeningAccess = onCall')));
assert.match(listening,/betaTester/,'allowlisted closed-beta adults receive temporary catalogue access without a subscription');

// The merge workflow must deploy the matching backend before publishing Hosting.
assert.match(hosting,/\[nightjar-closed-beta-access-release\]/,'closed-beta changes require their dedicated backend-first release tag');
assert.match(hosting,/inputs\[scope\]=beta:access/,'Hosting waits for the exact closed-beta backend deployment');
const verifyStart=deploy.indexOf('- name: Prepare Google Cloud CLI for function metadata checks');
const verifyEnd=deploy.indexOf('- name: Write sanitized release report',verifyStart);
const verifySteps=deploy.slice(verifyStart,verifyEnd);
assert.equal((verifySteps.match(/inputs\.scope == 'beta:access'/g)||[]).length,2,'both live-function verification steps include the beta-access scope');
assert.match(verifySource,/scope === 'functions' \|\| scope === 'all-backend' \|\| scope === 'beta:access'/,'the verification script checks functions deployed by the closed-beta scope');
const betaScopeStart=deploy.indexOf('beta:access)');
const betaScopeEnd=deploy.indexOf('admin-attention)',betaScopeStart);
assert.ok(betaScopeStart>0 && betaScopeEnd>betaScopeStart,'the backend workflow has a bounded beta-access deployment preset');
const betaScope=deploy.slice(betaScopeStart,betaScopeEnd);
const affected=[...backend.matchAll(/export const ([A-Za-z0-9_]+)\s*=\s*onCall[\s\S]*?(?=\nexport const |$)/g)]
  .filter(match=>/requireAgeVerified\(|requireGenuineAgeAssurance\(|betaListeningEntitlementFor\(|temporaryAgeBypassFor\(|DIDIT_VERIFICATION_PAUSED|DIDIT_ACCOUNT_SELF_SERVICE_ENABLED|TESTING_AGE_ASSURANCE_BYPASS/.test(match[0])
    || match[1]==='closedBetaRegistrationStatus')
  .map(match=>match[1]);
for(const name of affected) assert.ok(betaScope.includes('functions:'+name),'backend-first beta preset must deploy changed callable '+name);
const assuranceGate=backend.slice(backend.indexOf('const requireGenuineAgeAssurance'),backend.indexOf('export const getReleasePlaybackUrl'));
assert.match(assuranceGate,/diditPass\(data\)/,'genuine Didit approval is always accepted');
assert.doesNotMatch(assuranceGate,/temporaryAgeBypassFor\(uid\)/,'protected content cannot use the temporary beta allowlist');
assert.match(assuranceGate,/genuine_age_assurance_required/,'protected content fails closed without genuine Didit approval');
assert.match(backend,/const CLOSED_BETA = true/,'temporary full-feature access is restricted to closed beta');
assert.match(backend,/const TESTING_AGE_ASSURANCE_BYPASS = true/,'temporary age gate is explicitly enabled only for the test window');
assert.match(frontend,/setAgeVerified\(verified \|\| betaAccess\)/,'the complete app UI is unlocked for temporary beta admission');
assert.match(frontend,/ageTemporaryBypass \? 'TEST ACCESS'/,'the UI labels temporary access honestly instead of claiming Didit verification');
console.log('NightJar closed-beta: approved testers receive general app access without Didit; protected adult content remains genuine-Didit-only.');
