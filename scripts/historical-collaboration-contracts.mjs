import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
const server = read('functions/src/index.ts');
const button = read('src/components/CollaborationHistoryButton.tsx');
const hub = read('src/components/CollaborationHub.tsx');
const creator = read('src/components/CreatorProfile.tsx');
const writer = read('src/components/WriterDiscovery.tsx');
const publicProfile = read('src/components/PublicProfile.tsx');
const api = read('src/platform/firebase-collaboration.ts');

assert.match(server, /const verifiedCollaborationEvidence =/, 'server reconciles evidence');
assert.match(server, /normaliseReleaseContributors\(data.contributors\)/, 'released work counts only linked credited accounts');
assert.match(server, /if \(team.size < 2\) continue/, 'solo releases do not count as collaborations');
assert.match(server, /const additional = Math.max\(0, pair.count - \(publishedPairCount.get\(key\) \?\? 0\)\)/, 'completed proposals do not double count published teamwork');
assert.match(server, /const completedCollaborationCountFor = async/, 'individual profiles use shared verified count');
assert.match(server, /verifiedCollaborationEvidence\(releases.docs, collaborations.docs\)\.counts/, 'public directory uses historical evidence');
assert.match(server, /verifiedCollaborationEvidence\(publicReleases.docs, collaborations.docs\)\.counts/, 'writer proposal directory uses historical evidence');
assert.match(server, /completedCollaborations: completedByWriter.get\(doc.id\) \?\? 0/, 'writer directory includes verified history');
assert.match(server, /export const getVerifiedCollaborationHistory = onCall/, 'public history endpoint exists');
assert.match(server, /const publiclyAvailable = a.status === 'active'/, 'private accounts not exposed');
assert.match(server, /published: published.sort/, 'only published work returned');
assert.match(button, /onClick=\{\(event\) => \{ event.stopPropagation\(\); setOpen\(true\); \}\}/, 'handshake opens instead of incrementing');
assert.match(button, /Missing an older collaboration\?/, 'legacy missing-credit guidance displayed');
assert.match(button, /workflowOnlyCount/, 'private workflow results shown without private details');
assert.doesNotMatch(button, /updateCollaborationStatus|setStatus\(|saveMyProfile/, 'handshake cannot self-award a collaboration');
assert.match(api, /getVerifiedCollaborationHistory/, 'typed callable connected');
assert.match(hub, /<CollaborationHistoryButton/, 'directory badges are clickable');
assert.match(hub, /className="nj-collab-select"/, 'directory selection remains independent');
for (const [name, source] of [['Creator', creator], ['Public', publicProfile]]) {
  assert.match(source, /<CollaborationHistoryButton/, name + ' profile can inspect verified collaboration details');
}
// Writer discovery opens the same PublicProfile as other roles, so a second
// Writer modal with its own separate history control must not reappear.
assert.match(writer,/onOpenProfile\(writer\.userId, 'writer'\)/,'Writer opens the premium profile with verified collaboration history');
assert.doesNotMatch(writer,/\{selected && <div className="creator-profile-backdrop"/,'the obsolete Writer modal is removed');
console.log('Nightjar historical collaboration recognition and clickable handshake contracts PASS.');
