import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('functions/src/index.ts','utf8');
const client = readFileSync('src/platform/firebase-experience.ts','utf8');
const discovery = readFileSync('src/platform/listening-discovery.ts','utf8');
const player = readFileSync('src/components/NightjarPlayer.tsx','utf8');
const library = readFileSync('src/components/ListenerLibrary.tsx','utf8');
const app = readFileSync('src/App.tsx','utf8');
const voices = readFileSync('src/components/VoiceCallingCard.tsx','utf8');
const profile = readFileSync('src/components/PublicProfile.tsx','utf8');
const creator = readFileSync('src/components/CreatorProfile.tsx','utf8');
const timeline = readFileSync('src/components/CreatorProductionTimeline.tsx','utf8');

for (const fn of [
  'getMyListeningBoundaries','saveMyListeningBoundaries','listMomentMarks',
  'saveMomentMark','deleteMomentMark','getVoiceCallingCard',
  'saveVoiceCallingCard','myProductionTimeline',
]) {
  assert.match(backend, new RegExp('export const ' + fn + ' = onCall'), fn + ' must have an authenticated callable');
  assert.match(client, new RegExp("'"+fn+"'"), 'client must use '+fn);
}
for (const start of ['getMyListeningBoundaries','saveMyListeningBoundaries','listMomentMarks','saveMomentMark',
  'deleteMomentMark','getVoiceCallingCard','myProductionTimeline']) {
  const part = backend.slice(backend.indexOf('export const '+start+' ='),backend.indexOf('});',backend.indexOf('export const '+start+' ='))+3);
  assert.match(part,/requireActiveIdentity\(request\)/,'active account guard for '+start);
  assert.match(part,/requireAgeVerified\(identity\.uid\)/,'age assurance guard for '+start);
}
assert.match(backend,/requireAccountRole\(request, \['creator'\]\)/);
assert.match(backend,/release\.data\(\)\?\.status !== 'released'/);
assert.match(backend,/voiceCallingCardReleaseId/);
assert.match(backend,/momentMarksFor\(identity\.uid\)/);
assert.match(backend,/privateSettings'\)\.doc\('listening'/);
assert.match(backend,/\.limit\(60\)/);
assert.match(backend,/return \{ entries: entries\.slice\(0,200\) \}/);
assert.match(discovery,/DEFAULT_LISTENING_BOUNDARIES/);
assert.match(discovery,/hiddenByBoundaries/);
assert.match(discovery,/matchesListeningMood/);
assert.match(app,/hiddenByBoundaries\(track, listeningBoundaries\)/);
assert.match(app,/ListeningDiscoveryControls/);
assert.match(app,/CreatorProductionTimeline/);
assert.match(app,/VoiceCallingCardStudio/);
assert.match(app,/onPlayMoment=\{\(release,seconds\)=>/);
assert.match(app,/initialSeekSeconds=\{/);
assert.match(player,/saveMark\(track\.id, position, momentLabel/);
assert.match(player,/initialSeekSeconds !== null/);
assert.match(library,/Moment Marks/);
assert.match(library,/nightjarExperience\.deleteMark\(markId\)/);
assert.match(voices,/getVoiceCallingCard|voiceCard\(/);
assert.match(voices,/status === 'released'/);
assert.match(profile,/VoiceCallingCardPublic/);
assert.match(creator,/VoiceCallingCardPublic/);
assert.match(timeline,/nightjarExperience\.timeline\(\)/);
assert.doesNotMatch(backend.slice(backend.indexOf('// Low-cost listener experience additions.')),/onSchedule\(|onDocumentWritten\(|getMessaging\(/);
assert.match(backend,/const CLOSED_BETA = true/);
assert.match(backend,/const TESTING_AGE_ASSURANCE_BYPASS = true/);
console.log('Listening Moments, mood, private boundaries, curated VA cards and production timeline contracts PASS');
