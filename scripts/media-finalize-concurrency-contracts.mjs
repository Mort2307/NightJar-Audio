import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const backend=readFileSync(new URL('../functions/src/index.ts',import.meta.url),'utf8');
const section=(start,end)=>backend.slice(backend.indexOf('export const '+start+' = onCall'),backend.indexOf('export const '+end+' = onCall'));
for(const [kind,body,owner,pathField] of [
  ['Creator',section('finalizeReleaseAudio','removeReleaseAudio'),'creatorUserId','audioStoragePath'],
  ['Editor',section('finalizeEditorPortfolioAudio','submitEditorPortfolioItem'),'ownerUserId','pathField'],
]){
  assert.match(body,/db\.runTransaction\(async transaction =>/,'Transactional '+kind+' finalization required');
  assert.match(body,/const .* = await transaction\.get\(ref\)/,'Reload authoritative '+kind+' record');
  assert.ok(body.includes('!== identity.uid'),'Authenticated owner enforced for '+kind);
  assert.ok(body.includes('!== current.audioStoragePath')||body.includes('!== data[pathField]'),kind+' must reject stale device');
  assert.match(body,/transaction\.set\(ref/,'No unguarded last-wins writes for '+kind);
  assert.doesNotMatch(body,/file\(oldPath\)\.delete|const oldPath =/,'Displaced audio must not be deleted during finalize in '+kind);
}
assert.match(section('finalizeReleaseAudio','removeReleaseAudio'),/transcriptAccessibilityReviewed:false/);
assert.match(section('finalizeReleaseAudio','removeReleaseAudio'),/getStorage\(\)\.bucket\(\)\.file\(storagePath\)/);
assert.match(section('finalizeEditorPortfolioAudio','submitEditorPortfolioItem'),/const alreadyAttached = data\[pathField\] === storagePath/);
console.log('Private audio finalization transactional status, owner, stale-slot and safe retention contracts passed.');