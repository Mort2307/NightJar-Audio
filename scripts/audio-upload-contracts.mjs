import assert from 'node:assert/strict';
import fs from 'node:fs';

const creator = fs.readFileSync('src/components/CreatorAudioPipeline.tsx','utf8');
const editor = fs.readFileSync('src/components/EditorShowcaseManager.tsx','utf8');
const support = fs.readFileSync('src/platform/audio-upload.ts','utf8');
const client = fs.readFileSync('src/platform/firebase-audio-diagnostics.ts','utf8');
const admin = fs.readFileSync('src/components/AdminAudioUploadTest.tsx','utf8');
const settings = fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const functions = fs.readFileSync('functions/src/index.ts','utf8');
const rules = fs.readFileSync('storage.rules','utf8');
const catalogue = fs.readFileSync('src/platform/firebase-catalogue.ts','utf8');
const portfolio = fs.readFileSync('src/platform/firebase-editor-portfolio.ts','utf8');

assert.doesNotMatch(creator, /accept="audio\/\*"/, 'Creator picker must not grey out unknown MIME audio providers');
assert.doesNotMatch(editor, /accept="audio\/\*"/, 'Editor picker must not grey out unknown MIME audio providers');
assert.match(support, /application\/octet-stream/, 'Mobile generic MIME must be understood for known audio extensions');
assert.match(support, /nightjarAudioFileProblem/, 'Unrestricted picker still validates selected files');
assert.match(support, /NightjarAudioUploadError/, 'Audio errors have stable stages and codes');
assert.match(catalogue, /nightjarAudioContentType\(file\)/, 'Creator upload canonicalises supported audio MIME');
assert.match(portfolio, /nightjarAudioContentType\(file\)/, 'Editor upload canonicalises supported audio MIME');
assert.match(creator, /catch \(error\)/, 'Creator exposes safe error details instead of generic failure');
assert.match(editor, /catch \(error\)/, 'Editor exposes safe error details instead of generic failure');
assert.match(settings, /administrator && !simulationMode && <div className="nj-settings-tools"><details[^]*?<AdminAudioUploadTest\/>/, 'Only live admins see the upload QA control');
assert.match(admin, /type="file"/, 'Admin file picker is unrestricted');
assert.match(client, /uploadBytesResumable/, 'Admin test performs actual Firebase Storage transfer');
assert.match(client, /adminVerifyAudioUpload/, 'Admin test verifies transfer and deletion on server');
assert.match(functions, /export const adminVerifyAudioUpload = onCall/, 'Server exposes admin-only verification');
assert.match(functions, /const admin = requireAdminIdentity\(request\)/, 'Server authenticates admin');
assert.match(rules, /match \/audio-upload-diagnostics\/\{userId\}\/\{fileId\}/, 'Dedicated private admin test bucket prefix exists');
assert.match(rules, /allow read: if false/, 'Private audio remains unreadable to the public');
assert.match(rules, /request\.resource\.size <= 10 \* 1024 \* 1024/, 'Admin diagnostics capped at 10 MiB');
assert.match(functions, /await file\.delete\(\{ ignoreNotFound: true \}\)/, 'Server removes uploaded test audio');

// Attached audio is NOT the same as a moderation submission. Both creator
// and owner need to see the distinction, backed by real Firestore records.
const moderation = fs.readFileSync('src/components/ContentModeration.tsx','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const styles = fs.readFileSync('src/styles/product-system.css','utf8');
assert.match(catalogue,/uploadBytesResumable\(fileRef, file/, 'Creator uploads must stream observable Firebase Storage progress');
assert.match(catalogue,/onProgress\?\.\('verifying', 100\)/, 'Transfer completion must not imply server verification succeeded');
// A network timeout can happen after the backend has written its Firestore
// attachment. Never delete that same Storage object from a failed response.
const finalizeStart = functions.indexOf('export const finalizeReleaseAudio = onCall');
const finalizeEnd = functions.indexOf('export const ', finalizeStart + 15);
const finalizeHandler = functions.slice(finalizeStart, finalizeEnd);
assert.match(finalizeHandler, /const alreadyAttached = current\.audioStoragePath === storagePath/);
assert.match(finalizeHandler, /if \(alreadyAttached\) \{\s*return \{ release: releaseOwnerPayload\(current, releaseId\) \};/,
  'a retry of the same attached file must not rewrite data or invalidate a timed transcript');
assert.match(finalizeHandler, /const \[exists\] = await file\.exists\(\)/,
  'an idempotent status must not claim success for a missing Storage object');
assert.match(catalogue, /\['functions\/unavailable','functions\/deadline-exceeded','functions\/internal'\]\.includes\(code\)/,
  'only transient callable failures trigger one safe re-finalization of the same upload path');
assert.match(catalogue, /try \{\s*const result = \(await finalize\(\)\)\.data;\s*clearPendingAudio\(user\.uid, releaseId\);\s*return result;/,
  'transient response-loss recovery must retry the same backend finalize and clear a confirmed recovery reference');
assert.doesNotMatch(catalogue, /deleteObject\(fileRef\)/,
  'never delete a potentially attached recording due to an ambiguous callable response');
assert.match(support, /The private file was retained/, 'finalization errors must not falsely claim deletion or attachment');
const editorFinalize = functions.slice(functions.indexOf('export const finalizeEditorPortfolioAudio = onCall'),
  functions.indexOf('export const ', functions.indexOf('export const finalizeEditorPortfolioAudio = onCall') + 20));
assert.match(editorFinalize, /const alreadyAttached = data\[pathField\] === storagePath/);
assert.match(editorFinalize, /if \(alreadyAttached\) return \{ item: editorPortfolioPayload\(data, itemId\) \}/);
assert.doesNotMatch(portfolio, /deleteObject\(fileRef\)/,
  'an uncertain editor upload response cannot delete a now-attached file');
assert.match(portfolio, /try \{ return \(await finalize\(\)\)\.data; \}/,
  'editor retries the same private path after a transient response loss');
assert.match(catalogue, /writePendingAudio\(\{ uid:user\.uid, releaseId, storagePath/,
  'creator saves a minimal pending transfer reference after Storage confirms bytes');
assert.match(catalogue, /async recoverAudio\(releaseId: string\)/);
assert.match(catalogue, /readPendingAudio\(user\.uid, releaseId\)/);
assert.match(catalogue, /clearPendingAudio\(user\.uid, releaseId\)/);
assert.match(creator, /Recover uploaded recording/,
  'creator can retry finalizing existing private bytes after a refresh');
assert.match(creator, /nightjarCatalogue\.recoverAudio\(current\.id\)/);
assert.doesNotMatch(catalogue, /localStorage\.setItem\([^\n]*(file|dataUrl|signedUrl)/,
  'recovery must not persist audio bytes, signed URLs or access tokens');


assert.match(creator,/role="progressbar"/, 'Creator needs persistent transfer progress');
assert.match(creator,/Audio saved and verified in your private release/, 'Creator must see verified private-attachment status');
assert.match(creator,/This is NOT sent for approval yet/, 'Creator must not confuse upload with moderation submission');
assert.match(creator,/const saved = await persistReleaseMetadata\(latestRelease\.current\?\.id === current\.id \? latestRelease\.current : current,true\)/, 'Submit must persist revision-checked metadata before backend validation');
assert.match(creator,/submitted\.release\?\.status !== 'pending_review'/, 'Submit must verify moderation status from the server');
assert.match(creator,/From your recording to Nightjar/, 'Release flow shows four clear steps');
assert.match(functions,/export const adminReleaseAudioLibrary = onCall/, 'An admin-only all-audio library is required');
assert.match(functions,/export const adminReleaseAudioLibrary = onCall[\s\S]{0,160}requireAdminIdentity\(request\)/, 'Audio library enforces admin identity');
assert.match(functions,/\.filter\(doc=>Boolean\(doc\.data\(\)\.audioStoragePath\)\)/, 'Only attached verified release audio is included in the admin library');
assert.match(catalogue,/adminAudioLibrary\(cursor\?:string\)/, 'Client can fetch owner-only audio attachments');
assert.match(moderation,/All attached audio \(/, 'Admin can see saved draft audio separately from submissions');
assert.match(moderation,/Awaiting moderation \(/, 'Admin can switch to submission queue');
assert.match(moderation,/nightjarCatalogue\.adminPreview\(selected\.id\)/, 'Admin can actually listen using a protected signed URL');
assert.match(moderation,/selected\.status === 'pending_review' && <div className="nj-admin-decision">/, 'Moderation actions must be restricted to submitted items');
assert.match(app,/Open audio library &amp; moderation/, 'Audio review is discoverable from admin Content workpage');
assert.match(styles,/\.nj-audio-upload-progress/, 'Creator progress indicator must be styled');
assert.match(styles,/\.nj-audio-review-tabs/, 'Admin review tabs must be styled');

console.log('Nightjar mobile audio picker and administrator integration test contracts passed.');
