import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const backend=src('functions/src/index.ts');
const helper=src('src/platform/client-create-idempotency.ts');
const creator=src('src/platform/firebase-catalogue.ts');
const artist=src('src/platform/firebase-artists.ts');
const editor=src('src/platform/firebase-editor-portfolio.ts');
const segment=(start,end)=>backend.slice(backend.indexOf(start),backend.indexOf(end,backend.indexOf(start)));
const release=segment('export const createRelease = onCall','export const updateRelease = onCall');
const artwork=segment('export const createArtistPortfolioItem = onCall','export const myArtistPortfolio = onCall');
const showcase=segment('export const createEditorPortfolioItem = onCall','export const myEditorPortfolio = onCall');

assert.match(helper,/firebaseAuth\.currentUser\?\.uid/);
assert.match(helper,/crypto\.randomUUID\(\)/);
assert.match(helper,/window\.localStorage\.setItem/);
assert.match(helper,/currentPendingOperationId|pendingPrivateCreateId/);
assert.match(backend,/const privateCreateRequestId=/);
assert.match(backend,/new HttpsError\('invalid-argument','Private creation request identifier is invalid\.'/);
assert.match(backend,/const savePrivateRecordOnce=async/);
assert.match(backend,/db\.runTransaction\(async tx=>/);
assert.match(backend,/const snap=await tx\.get\(ref\)/);
assert.match(backend,/snap\.data\(\)\?\.\[ownerKey\]!==uid/);
assert.match(backend,/tx\.set\(ref,record\)/);
for(const [scope,body,api,kind,owner] of [
  ['creator',release,creator,'creator-release','creatorUserId'],
  ['artist',artwork,artist,'artist-artwork','ownerUserId'],
  ['editor',showcase,editor,'editor-showcase','ownerUserId'],
]){
  assert.match(body,/privateCreateRequestId\(input\)/,scope+' validates id');
  assert.ok(body.includes("'"+owner+"'"),scope+' owner enforced');
  assert.match(body,/savePrivateRecordOnce\(ref,record/,scope+' reuses original private document');
  assert.ok(api.includes("pendingPrivateCreateId('"+kind+"')"),scope+' persists retry ID');
  assert.ok(api.includes("clearPrivateCreateId('"+kind+"',clientRequestId)"),scope+' clears only on acknowledgement');
}
assert.match(release,/if\(!reused\)await syncCreatorCustomTagUsage\(identity\.uid\)/);
assert.match(artwork,/quotaExceeded/, 'Artist count limit applies only to new records');
assert.doesNotMatch(helper,/dataUrl|storagePath|password|signedUrl/, 'Receipt cache stores no media bytes or secrets');
console.log('Idempotent private creation, owner isolation, receipt and quota contracts passed.');
