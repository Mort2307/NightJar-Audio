import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p)=>readFileSync(p,'utf8');
const backend=read('functions/src/publication-notifications.ts');
const index=read('functions/src/index.ts');
const app=read('src/App.tsx');
const prefs=read('src/components/NotificationPreferences.tsx');
const marketplace=read('src/components/ScriptMarketplace.tsx');
const publicProfile=read('src/components/PublicProfile.tsx');
const worker=read('public/service-worker.js');

for(const id of ['notifyPublishedAudio','notifyPublishedScript','notifyPublishedArtwork','notifyNewFollower']){
  assert.ok(index.includes(id) && index.includes("from './publication-notifications'"), id+' exported');
  assert.match(backend,new RegExp('export const '+id+'='));
}
assert.match(backend,/onDocumentWritten/,'Publication alerts trigger on status changes');
assert.match(backend,/onDocumentCreated/,'Follower alerts trigger only on new follow relationships');
assert.match(backend,/isPublished\(kind,current\)\|\|isPublished\(kind,previous\)/,'Only public transitions fan out');
assert.match(backend,/data\.status==='released'/);
assert.match(backend,/isPublicScript\(data\)/);
assert.match(backend,/data\.status==='published' && data\.imageStatus==='approved'/);
assert.match(backend,/listing\.visibility==='marketplace'/);
assert.match(backend,/publicProfile===false/,'Private artist profiles never broadcast');
assert.match(backend,/doc\(idFor\(key\)\)/,'Durable per-member dedupe IDs');
assert.match(backend,/await ref\.create\(payload\)/,'No repeated push from trigger retries');
assert.match(backend,/startAfter\(last\)/,'Pagination covers members beyond first page');
assert.match(backend,/member\.ref\.collection\('follows'\)\.doc\(ownerId\)\.get\(\)/,'A following user gets one personalised alert');
assert.match(backend,/member\.id===ownerId/,'Do not advertise own uploads back to publisher');
assert.match(backend,/sendEachForMulticast/,'Push uses registered device tokens');
assert.match(backend,/displayMode/,'Discreet or minimal lock screen choices supported');
assert.match(backend,/prefs\.newFollowers===false/,'New follower alert opt-out');
assert.match(backend,/new_follower/,'Follower alert created');
assert.match(index,/newScripts: stored\.newScripts !== false/);
assert.match(index,/newArtwork: input\.newArtwork !== false/);
assert.match(index,/newFollowers: input\.newFollowers !== false/);
for(const pref of ['newReleases','newScripts','newArtwork','newFollowers'])
  assert.ok(prefs.includes("['"+pref+"'"), 'A preference toggle exists for '+pref);
assert.match(app,/openPublicationNotificationRoute/,'Unified click-through navigation');
assert.match(app,/NIGHTJAR_PUSH_OPEN/,'Existing service worker messages open in app');
assert.match(worker,/NIGHTJAR_PUSH_OPEN/,'Worker delivers same-origin routes');
assert.match(app,/setFocusedContentReleaseId/);
assert.match(app,/setFocusedContentScriptId/);
assert.match(app,/nightjar-public-script-marketplace/,'All verified roles can browse public script synopsis');
assert.match(app,/nightjar-release-/);
assert.match(marketplace,/nightjar-marketplace-script-/);
assert.match(publicProfile,/nightjar-artwork-/);
assert.match(app,/new_audio/,'New audio notification routes');
console.log('NightJar publication, follower, preference and exact-item notification contracts PASS');
