import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const artist=readFileSync(new URL('../src/components/ArtistPortfolioManager.tsx',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/components/EditorShowcaseManager.tsx',import.meta.url),'utf8');
const backend=readFileSync(new URL('../functions/src/index.ts',import.meta.url),'utf8');

assert.match(artist,/let itemId = retryItemId/);
assert.match(artist,/nightjarArtists\.mine\(\)/);
assert.match(artist,/existing\.pendingImageAssetId \|\| existing\.imageUrl/);
assert.match(artist,/targetId:itemId!/);
assert.match(artist,/Resume image upload/);
assert.match(artist,/setRetryItemId\(itemId\)/);
assert.match(artist,/setDraftClearSignal\(value => value \+ 1\)/);
assert.match(editor,/let itemId = retryItemId/);
assert.match(editor,/existing\?\.afterAudioAvailable/);
assert.match(editor,/existing\?\.beforeAudioAvailable/);
assert.match(editor,/nightjarEditorPortfolio\.mine\(\)/);
assert.match(editor,/Resume upload/);
assert.match(editor,/submitExisting\(item\.id\)/);
assert.match(editor,/Showcase was already submitted/);
assert.match(backend,/export const myArtistPortfolio = onCall/);
assert.match(backend,/export const myEditorPortfolio = onCall/);
// Browser file data and attestation checkboxes are not metadata autosave fields.
for(const invalid of ['afterFile','beforeFile','file','humanCreated','rightsConfirmed','permissionsConfirmed']){
  const artistScope=backend.slice(backend.indexOf("'form-artist-portfolio':new Set"),backend.indexOf('const profileDraftScope'));
  assert.ok(!artistScope.includes("'"+invalid+"'"), invalid+' must not be persisted to form drafts');
}
const catalogue=readFileSync(new URL('../src/platform/firebase-catalogue.ts',import.meta.url),'utf8');
const creator=readFileSync(new URL('../src/components/CreatorAudioPipeline.tsx',import.meta.url),'utf8');
assert.match(catalogue,/writeInterruptedAudio\(\{uid:user\.uid,releaseId,startedAt:Date\.now\(\)\}\)/,'Mark only account-scoped incomplete transfer');
assert.match(catalogue,/writePendingAudio\([\s\S]*?clearInterruptedAudio\(user\.uid,releaseId\)/,'Only Storage completion may replace partial marker with finalize receipt');
assert.match(catalogue,/if\(readPendingAudio\(user\.uid,releaseId\)\)/,'Never re-upload while the prior bytes await safe finalisation');
assert.match(catalogue,/interruptedAudio\(releaseId:string\)/,'Expose truthful interrupted transfer state');
assert.match(creator,/nightjarCatalogue\.interruptedAudio\(selectedRelease\.id\)/,'Restore interrupted state on same signed-in draft');
assert.match(creator,/browser cannot recover partial audio bytes after a restart/,'Do not invent browser-reload resumability');
assert.match(creator,/Select your original recording again/,'Give accessible original-file reselect');
console.log('Artist and Editor interrupted-upload recovery contracts passed');
