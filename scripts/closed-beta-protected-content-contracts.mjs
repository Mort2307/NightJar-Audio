// Closed-beta access must never unlock adult audio or protected manuscripts.
// Source-level regression contract; no Firebase data or provider sessions are touched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend=readFileSync('functions/src/index.ts','utf8');
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
console.log('NightJar closed-beta separation: genuine age assurance remains mandatory for protected audio, transcripts and manuscripts.');
