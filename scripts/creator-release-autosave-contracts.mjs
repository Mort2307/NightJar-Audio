import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server=readFileSync(new URL('../functions/src/index.ts',import.meta.url),'utf8');
const component=readFileSync(new URL('../src/components/CreatorAudioPipeline.tsx',import.meta.url),'utf8');
const metadata=readFileSync(new URL('../src/platform/creator-release-metadata.ts',import.meta.url),'utf8');
const change=server.slice(server.indexOf('export const updateRelease = onCall'),server.indexOf('// Removal is available',server.indexOf('export const updateRelease = onCall')));
const owner=server.slice(server.indexOf('const releaseOwnerPayload'),server.indexOf('const releaseSearchText'));
assert.match(owner,/metadataRevision:/);
assert.match(change,/db\.runTransaction\(async \(tx\) =>/);
assert.match(change,/const snapshot = await tx\.get\(ref\)/);
assert.match(change,/current\.creatorUserId !== identity\.uid/);
assert.match(change,/revision !== expectedRevision/);
assert.match(change,/release_metadata_conflict/);
assert.match(change,/metadataRevision: revision \+ 1/);
assert.match(change,/tx\.set\(ref, update/);
assert.match(change,/tagsChanged = Array\.isArray\(input\.tags\)/, 'Autosave must not scan tag usage for unchanged tags');
assert.match(change,/if \(tagsChanged\) await syncCreatorCustomTagUsage\(identity\.uid\)/, 'Avoid unrelated Firestore tag fan-out on every text edit');
assert.ok(!change.includes('await ref.set(update'), 'Release metadata must not bypass transactional revision checks');
assert.match(component,/const persistReleaseMetadata = async/);
assert.match(component,/expectedMetadataRevision:known\.revision/);
assert.match(component,/metadataInFlight\.current/);
assert.match(component,/window\.setTimeout\(\(\) =>/);
assert.match(component,/setMetadataConflict\(remote\)/);
assert.match(component,/Load latest account version/);
assert.match(component,/Keep my edits and retry/);
assert.match(component,/await persistReleaseMetadata\(latestRelease\.current\?/);
assert.match(component,/!saved\) throw new Error\('Release details are not saved/);
assert.match(component,/status === 'draft' && !simulationMode/);
const allowlist=metadata.slice(metadata.indexOf('export function creatorEditableMetadata'),metadata.indexOf('export const creatorMetadataSignature'));
for(const forbidden of ['rightsConfirmed','contributorPermissionsConfirmed','releaseDistributionConfirmed','transcriptAccessibilityReviewed','audioStoragePath','pendingArtworkAssetId','audioUrl']){
  assert.ok(!allowlist.includes(forbidden), forbidden+' must not be autosaved or touched by metadata payload');
}
assert.match(metadata,/contributors: source\.contributors/);
assert.match(metadata,/scheduledAt: source\.scheduledAt/);
assert.match(metadata,/transcriptText: source\.transcriptText/);
console.log('Creator metadata revision, recovery, submission and exclusions validated.');
