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
assert.match(settings, /administrator && !simulationMode && <div className="nj-settings-tools"><AdminAudioUploadTest\/>/, 'Only live admins see the upload QA control');
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
assert.match(creator,/role="progressbar"/, 'Creator needs persistent transfer progress');
assert.match(creator,/Audio saved and verified in your private release/, 'Creator must see verified private-attachment status');
assert.match(creator,/This is NOT sent for approval yet/, 'Creator must not confuse upload with moderation submission');
assert.match(creator,/const saved = await nightjarCatalogue\.update\(current\.id/, 'Submit must persist unsaved metadata before backend validation');
assert.match(creator,/submitted\.release\?\.status !== 'pending_review'/, 'Submit must verify moderation status from the server');
assert.match(creator,/From your recording to Nightjar/, 'Release flow shows four clear steps');
assert.match(functions,/export const adminReleaseAudioLibrary = onCall/, 'An admin-only all-audio library is required');
assert.match(functions,/requireAdminIdentity\(request\);[\s\S]{0,130}const snapshot = await db\.collection\('releases'\)\.limit\(1000\)/, 'Audio library enforces admin identity');
assert.match(functions,/\.filter\(\(doc\) => Boolean\(doc\.data\(\)\.audioStoragePath\)\)/, 'Only attached verified release audio is included in the admin library');
assert.match(catalogue,/adminAudioLibrary\(\)/, 'Client can fetch owner-only audio attachments');
assert.match(moderation,/All attached audio \(/, 'Admin can see saved draft audio separately from submissions');
assert.match(moderation,/Awaiting moderation \(/, 'Admin can switch to submission queue');
assert.match(moderation,/nightjarCatalogue\.adminPreview\(selected\.id\)/, 'Admin can actually listen using a protected signed URL');
assert.match(moderation,/selected\.status === 'pending_review' && <div className="nj-admin-decision">/, 'Moderation actions must be restricted to submitted items');
assert.match(moderation,/reviewDecision!=='approved'&&!reviewNote\.trim\(\)/, 'A rejection or changes request requires a written reason');
assert.match(moderation,/Approve & schedule/, 'Approval must distinguish future scheduled publication');
assert.match(app,/Open audio library &amp; moderation/, 'Audio review is discoverable from admin Content workpage');
assert.match(styles,/\.nj-audio-upload-progress/, 'Creator progress indicator must be styled');
assert.match(styles,/\.nj-audio-review-tabs/, 'Admin review tabs must be styled');

console.log('Nightjar mobile audio picker and administrator integration test contracts passed.');
