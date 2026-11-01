// Independent read-only source contracts: no tester accounts, Firebase or
// paid billing provider are altered by this test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path,'utf8');
const backend=read('functions/src/index.ts');
const policy=read('functions/src/entitlements.ts');
const unit=read('functions/src/entitlements.test.ts');
const workflow=read('.github/workflows/firebase-hosting-merge.yml');

const marker=backend.indexOf('const betaListeningEntitlementFor = async');
const stop=backend.indexOf('const playbackAccessFor = (',marker);
assert.ok(marker>0 && stop>marker,'beta entitlement has a bounded policy');
const helper=backend.slice(marker,stop);
assert.match(helper,/!CLOSED_BETA \|\| administrator/,'beta is closed-only and never replaces administrator');
assert.match(helper,/accountRef\(uid\)\.get\(\)/,'check current account');
assert.match(helper,/db\.collection\('ageAssurance'\)\.doc\(uid\)\.get\(\)/,'check same user Didit');
assert.match(helper,/diditPass\(assurance\.data\(\)\)/,'only authentic live Didit 18+ approval');
assert.match(helper,/cleanEmail\(data\.email\) === email/,'do not grant to mismatched account');
assert.match(helper,/data\.testAccess === true \|\| Boolean\(await testerAccessForEmail\(email\)\)/,'admin-controlled tester approval only');
assert.match(helper,/canUseBetaListening/,'pure gate for test coverage');
assert.match(policy,/!policy\.accountSuspended/,'suspended users stay blocked');
assert.match(policy,/policy\.providerVerifiedAdult/,'no age bypass');
assert.match(policy,/policy\.closedBeta/,'beta expiry is automatic when public launch begins');
assert.match(unit,/test\('approved adult closed-beta testers can listen/,'policy boundaries have unit tests');

const access=backend.slice(backend.indexOf('const playbackAccessFor = ('),backend.indexOf('const decorateReleaseAccess = ('));
assert.match(access,/if \(options\.subscription\)/,'paid entitlement remains');
assert.match(access,/if \(releaseWorkAccess\(data, userId\)\)/,'credits retain access');
assert.match(access,/options\.betaTester === true && CLOSED_BETA/,'controlled beta access grants no paid entitlement');
assert.match(access,/reason:'closed_beta_tester'/,'diagnostic reason distinguishes beta from payment');

for(const name of [
  'getPublicProfile','getCreatorProfile','myListeningAccess','listCatalogue',
  'getReleasePlaybackUrl','getReleaseTranscript','recommendations','trendingReleases',
  'getVoiceCallingCard',
]){
  const pos=backend.indexOf('export const '+name+' = onCall');
  assert.ok(pos>0,'missing listening function: '+name);
  const next=backend.indexOf('export const ',pos+20);
  const body=backend.slice(pos,next<0?undefined:next);
  assert.match(body,/betaListeningEntitlementFor\(/,'beta scope absent from '+name);
}
const playback=backend.slice(backend.indexOf('export const getReleasePlaybackUrl = onCall'),
  backend.indexOf('export const getReleaseSyncAudioUrl = onCall'));
assert.match(playback,/await requireAgeVerified\(identity\.uid\)/);
assert.match(playback,/data\.status !== 'released'/,'cannot access draft or unapproved audio');
assert.match(playback,/!await hasPublishedStudioNoteParent\(data\)/,'studio-note publication gate remains');
assert.match(playback,/playbackAccessFor\(data, identity\.uid, \{ admin:identity\.admin, subscription, betaTester \}\)/);
const transcript=backend.slice(backend.indexOf('export const getReleaseTranscript = onCall'),
  backend.indexOf('export const ',backend.indexOf('export const getReleaseTranscript = onCall')+20));
assert.match(transcript,/data\.status !== 'released' && !ownDraft && !adminPreview/,'draft transcripts remain private');
assert.match(transcript,/playbackAccessFor\(data, identity\.uid, \{ subscription, betaTester \}\)/);
const listener=backend.slice(backend.indexOf('export const myListeningAccess = onCall'),
  backend.indexOf('const professionalRolesForAccount',backend.indexOf('export const myListeningAccess = onCall')));
assert.match(listener,/closedBetaListening: betaTester/);
assert.match(listener,/cataloguePlaybackAvailable:/);
assert.match(listener,/subscribed: identity\.admin \|\| Boolean\(subscription\)/,'beta cannot falsify subscribed');
assert.match(workflow,/\[nightjar-beta-listening-release\]/,'Hosting must wait for reviewable selected Functions deploy');
assert.match(workflow,/listCatalogue,getPublicProfile,getCreatorProfile,myListeningAccess,getReleasePlaybackUrl,getReleaseTranscript,recommendations,trendingReleases,getVoiceCallingCard/,
 'selected-functions list must cover all listener endpoints');
console.log('NightJar beta listening backend: signed adult, account-scoped tester access and publication controls PASS.');
