// Closed-beta access must never unlock adult audio or protected manuscripts.
// Source-level regression contract; no Firebase data or provider sessions are touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend=readFileSync('functions/src/index.ts','utf8');
const hosting=readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const deploy=readFileSync('.github/workflows/firebase-backend-deploy.yml','utf8');
const helperStart=backend.indexOf('const requireGenuineAgeVerified = async');
const helperEnd=backend.indexOf('\nexport const getReleasePlaybackUrl',helperStart);
assert.ok(helperStart>0 && helperEnd>helperStart,'strict protected-content age gate exists');
const helper=backend.slice(helperStart,helperEnd);
assert.match(helper,/diditPass\(data\)/,'only a genuine Didit approval satisfies protected-content access');
assert.doesNotMatch(helper,/temporaryAgeBypassFor|TESTING_AGE_ASSURANCE_BYPASS|CLOSED_BETA/,'beta admission cannot satisfy protected-content age assurance');
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
]){
  const start=backend.indexOf('export const '+name+' = onCall');
  assert.ok(start>0,'missing protected-content endpoint '+name);
  const next=backend.indexOf('\nexport const ',start+20);
  const body=backend.slice(start,next<0?undefined:next);
  assert.match(body,/requireGenuineAgeVerified\(/,'genuine age assurance is mandatory for '+name);
}
const listening=backend.slice(backend.indexOf('export const myListeningAccess = onCall'),
  backend.indexOf('const professionalRolesForAccount',backend.indexOf('export const myListeningAccess = onCall')));
assert.match(listening,/genuineAgeAssurance &&/,'unverified beta members are shown as unable to play protected audio');

// The merge workflow must deploy the matching backend before publishing Hosting.
assert.match(hosting,/\[nightjar-closed-beta-access-release\]/,'closed-beta changes require their dedicated backend-first release tag');
assert.match(hosting,/inputs\[scope\]=beta:access/,'Hosting waits for the exact closed-beta backend deployment');
const betaScopeStart=deploy.indexOf('beta:access)');
const betaScopeEnd=deploy.indexOf('admin-attention)',betaScopeStart);
assert.ok(betaScopeStart>0 && betaScopeEnd>betaScopeStart,'the backend workflow has a bounded beta-access deployment preset');
const betaScope=deploy.slice(betaScopeStart,betaScopeEnd);
const affected=[...backend.matchAll(/export const ([A-Za-z0-9_]+)\\s*=\\s*onCall[\\s\\S]*?(?=\\nexport const |$)/g)]
  .filter(match=>/requireAgeVerified\\(|requireGenuineAgeVerified\\(|betaListeningEntitlementFor\\(|temporaryAgeBypassFor\\(|DIDIT_VERIFICATION_PAUSED|DIDIT_ACCOUNT_SELF_SERVICE_ENABLED|TESTING_AGE_ASSURANCE_BYPASS/.test(match[0])
    || match[1]==='closedBetaRegistrationStatus')
  .map(match=>match[1]);
for(const name of affected) assert.ok(betaScope.includes('functions:'+name),'backend-first beta preset must deploy changed callable '+name);
console.log('NightJar closed-beta separation: genuine age assurance remains mandatory for protected content, and all affected callables deploy backend-first.');
