import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static safety contracts; genuine Firestore/device/admin evidence remains a
// separate acceptance gate and must not be marked PASS by this script.
const source=(path)=>readFileSync(new URL('../'+path, import.meta.url),'utf8');
const backend=source('functions/src/index.ts');
const client=source('src/platform/firebase-scripts.ts');
const app=source('src/App.tsx');
const helper=source('src/platform/client-create-idempotency.ts');
const grid=source('src/components/WriterManuscriptGrid.tsx');
const hosting=source('.github/workflows/firebase-hosting-merge.yml');
const slice=(start,end)=>backend.slice(backend.indexOf(start),backend.indexOf(end,backend.indexOf(start)));

const draft=slice('export const createWriterScript = onCall','export const uploadWriterScriptFile = onCall');
const upload=slice('export const uploadWriterScriptFile = onCall','export const updateWriterScript = onCall');
const submit=slice('export const submitWriterScript = onCall','export const listEditorQueue = onCall');
const approve=slice('export const adminReviewWriterScript = onCall','export const listManuscriptReviewThread = onCall');
const rights=slice('export const updateScriptRightsAndListing = onCall','export const adminPreviewScriptMarketplace = onCall');

for(const [name,code] of [['draft',draft],['upload',upload]]) {
  assert.match(code,/privateCreateRequestId\(input\)/, name+' accepts a stable retry identifier');
  assert.match(code,/clientRequestId \? db\.collection\('scripts'\)\.doc\(clientRequestId\)/, name+' selects one canonical record');
  assert.match(code,/savePrivateRecordOnce\(ref,[\s\S]*?'writerUserId', identity\.uid, clientRequestId\)/, name+' enforces one account-owned transaction');
  assert.match(code,/reused/, name+' returns whether the original was recovered');
  assert.match(code,/status: 'Draft'/, name+' must never automatically approve uploads');
}
assert.match(upload,/sourceSha256 = createHash\('sha256'\)\.update\(bytes\)\.digest\('hex'\)/);
assert.match(upload,/prior\.writerUserId !== identity\.uid/);
assert.match(upload,/prior\.originalUpload\?\.sourceSha256 !== sourceSha256/);
assert.match(upload,/if \(reused\) await file\.delete\(\{ ignoreNotFound: true \}\)/,
  'concurrent retry bytes do not leave a second uploaded source');
assert.match(submit,/status: 'Submitted'/);
assert.match(approve,/requireAdminIdentity\(request\)/);
assert.match(approve,/sourceReviewed === true/);
assert.match(approve,/adminReviewEvidence/);
assert.match(approve,/status:nextStatus/);
assert.doesNotMatch(rights,/status: 'Approved'/,
  'saving licences must not approve the manuscript');

assert.match(helper,/writer-draft' \| 'writer-upload'/);
assert.match(client,/pendingPrivateCreateId\('writer-draft'\)/);
assert.match(client,/clearPrivateCreateId\('writer-draft', requestId\)/);
assert.match(client,/pendingPrivateCreateId\('writer-upload', fingerprint\)/);
assert.match(client,/clearPrivateCreateId\('writer-upload', requestId, fingerprint\)/);
assert.match(app,/writerCreateInFlightRef\.current/);
assert.match(app,/writerUploadInFlightRef\.current/);
assert.match(app,/crypto\.subtle\.digest\('SHA-256'/);
assert.match(app,/Check My manuscripts before retrying/);
assert.match(grid,/key=\{script\.id\}/,'no unsafe title-only hiding or deletion of existing manuscripts');
assert.match(hosting,/\[nightjar-writer-upload-idempotency-release\]/);
assert.match(hosting,/createWriterScript,uploadWriterScriptFile/);

console.log('Writer create/upload retry safety, rights and manual-approval contracts PASS.');
