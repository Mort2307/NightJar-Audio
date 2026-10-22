import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static integration contracts guard that all five protected public paths
// consult the SAME parent-visibility rule. They complement, not replace,
// real-account and device acceptance tests.
const src=readFileSync('functions/src/index.ts','utf8');
const slice=(start,end)=>src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start)+start.length));
const gate=slice('const studioNoteParentIsPublished =','export const listCatalogue =');
assert.match(gate,/parent\.status === 'released'/);
assert.match(gate,/parent\.creatorUserId === note\.creatorUserId/);
assert.match(gate,/!parent\.studioNoteForReleaseId/);
assert.match(gate,/db\.getAll\(/);
assert.match(slice('export const listCatalogue =','export const createRelease ='),/visiblePublishedStudioNoteDocs\(snapshot\.docs\)/);
assert.match(slice('export const getReleasePlaybackUrl =','export const getReleaseSyncAudioUrl ='),/hasPublishedStudioNoteParent\(data\)/);
assert.match(slice('export const getReleaseTranscript =','const adminReleasePageInput='),/hasPublishedStudioNoteParent\(data\)/);
assert.match(slice('export const moderateRelease =','const QUALIFIED_LISTEN_COOLDOWN_MS'),/transaction\.get\(releaseRef\(parentId\)\)/);
assert.match(slice('export const moderateRelease =','const QUALIFIED_LISTEN_COOLDOWN_MS'),/decision === 'approved'/);
assert.match(slice('export const recommendations =','export const trendingReleases ='),/visiblePublishedStudioNoteDocs\(releasesSnapshot\.docs\)/);
assert.match(slice('export const trendingReleases =','const adminActionNotifications'),/visiblePublishedStudioNoteDocs\(releasesSnapshot\.docs\)/);
console.log('Studio Notes protected parent, moderation and catalogue contracts PASS.');
