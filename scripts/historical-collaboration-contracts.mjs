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
const marketplaceActions = read('src/components/MarketplaceScriptActions.tsx');

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
assert.match(server, /initiatedByUserId: data\.initiatedByUserId \?\? data\.writerUserId/, 'proposal payload preserves the initiator');
assert.match(server, /await requireAgeVerified\(identity\.uid\);[\s\S]*?const input = \(request\.data \?\? \{\}\) as Record<string, unknown>;/, 'marketplace interest requires the same age gate as marketplace access');
assert.match(server, /const expectedResponderUserId = data\?\.initiatedByUserId[\s\S]*?expectedResponderUserId !== identity\.uid/, 'Writer can respond to a Creator-initiated marketplace interest');
assert.match(server, /const initiatorUserId = cleanText\(data\.initiatedByUserId, 160\) \|\| data\.writerUserId/, 'response notifications route to the original initiator');
assert.match(server, /Only the person who initiated this collaboration can withdraw it/, 'only the initiator can withdraw a request');
assert.match(server, /const alreadyOpen = priorRequests\.docs\.some/, 'duplicate active marketplace interests are prevented');
assert.match(hub, /const incoming = role === 'writer'[\s\S]*?proposal\.initiatedByUserId !== proposal\.writerUserId/, 'Writer workspace recognises Creator-initiated interest');
assert.match(hub, /\{incoming && !\['declined','withdrawn','completed'\]/, 'Writer can accept, discuss or decline incoming interest');
assert.match(hub, /const counterpartUserId = role === 'writer' \? proposal\.recipientUserId : proposal\.writerUserId/, 'collaboration messaging targets the other participant');
assert.match(marketplaceActions, /Express collaboration interest/, 'marketplace exposes an explicit collaboration CTA');
assert.match(marketplaceActions, /mode==='interest'[\s\S]*?nightjarCollaboration\.expressInterest/, 'formal interest creates a collaboration request');
assert.match(marketplaceActions, /else if\(mode==='interest'\)/, 'ordinary Writer questions do not create collaboration requests');
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
