import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('functions/src/index.ts', 'utf8');
const alerts = readFileSync('functions/src/admin-attention.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const client = readFileSync('src/platform/firebase-scripts.ts', 'utf8');
const queue = readFileSync('src/components/AdminManuscriptReview.tsx', 'utf8');
const grid = readFileSync('src/components/WriterManuscriptGrid.tsx', 'utf8');
const gridStyles = readFileSync('src/components/writer-manuscript-grid.css', 'utf8');

const submit = api.slice(api.indexOf('export const submitWriterScript ='), api.indexOf('export const listEditorQueue ='));
const adminReview = api.slice(api.indexOf('export const adminReviewWriterScript ='), api.indexOf('export const adminAssignEditor ='));
const editorReview = api.slice(api.indexOf('export const reviewEditorScript ='), api.indexOf('export const listEditorAccounts ='));
const listing = api.slice(api.indexOf('export const listScriptMarketplace ='), api.indexOf('export const expressScriptInterest ='));

assert.match(submit, /status: 'Submitted'/);
const writerEdit = api.slice(api.indexOf('export const updateWriterScript ='), api.indexOf('export const deleteWriterScript ='));
assert.match(writerEdit, /Number\(input\.expectedRevision\)/,
  'manuscript updates must carry account revisions');
assert.match(writerEdit, /db\.runTransaction\(async \(transaction\) =>/,
  'manuscript content writes must be atomic');
assert.match(writerEdit, /currentRevision !== expectedRevision/,
  'stale edits from a second device must be rejected');
assert.match(writerEdit, /manuscript_revision_conflict/,
  'conflict errors must be explicit and never contain protected manuscript text');
assert.match(writerEdit, /contentRevision: currentRevision \+ 1/,
  'successful text writes increment the account revision');
assert.match(api, /contentRevision: Math\.max\(0, Number\(data\.contentRevision \?\? 0\)\)/,
  'writers must receive server revision');
assert.match(submit, /db\.runTransaction\(async \(tx\) =>/,
  'submit status and edit lock must be atomic');
assert.match(app, /expectedRevision: Number\(writerSelected\.contentRevision \?\? 0\)/,
  'Writer Studio must save against its last acknowledged revision');
assert.match(app, /writerAutoSavePaused/,
  'offline writer drafts must pause repeated automatic writes');
assert.match(app, /modifiedDuringSave/,
  'in-flight saves must not clobber newer keystrokes');
assert.match(app, /Review latest account revision/,
  'writers must have an explicit conflict resolution control');
assert.match(app, /beforeunload/,
  'an unsynced manuscript warns when leaving the tab');

assert.match(submit, /rights\.ownershipAttested !== true \|\| rights\.contributorPermissionsConfirmed !== true/);
assert.match(api, /where\('status', 'in', \['Submitted','Under review'\]\)/, 'Submitted and assigned scripts count toward admin actions');
assert.match(api, /count:scriptQueue\.docs\.length, label:'manuscript awaiting admin review'/);
assert.match(alerts, /case 'scripts': return \['Submitted','Under review'\]\.includes\(status\)/);
assert.match(alerts, /Manuscript awaiting NightJar approval/);

assert.match(adminReview, /requireAdminIdentity\(request\)/);
assert.match(adminReview, /\['Submitted','Under review'\]/);
assert.match(adminReview, /transaction\.set\(ref, \{/);
assert.match(adminReview, /const reviewEventRef = ref\.collection\('reviewThread'\)\.doc\(\)/,
  'create one durable Writer-visible decision ID outside transaction retries');
assert.match(adminReview, /transaction\.create\(reviewEventRef, \{/,
  'Writer-visible review reason must commit in the same transaction as decision status');
assert.doesNotMatch(adminReview, /await ref\.collection\('reviewThread'\)\.add\(/,
  'best-effort post-commit writes must not silently lose the Writer reason');
assert.match(adminReview, /dedupeKey:'writer-script-review:'\+scriptId\+':'\+reviewEventRef\.id/,
  'supplemental notification must be idempotent for the accepted decision');

const previewFn = api.slice(api.indexOf('export const getAdminScriptReview = onCall'),api.indexOf('export const adminReviewWriterScript = onCall'));
assert.match(previewFn,/sourcePreview\.format === 'pdf'/,'PDF preview requires a source');
assert.match(previewFn,/sourcePreview\.truncated !== true/,'Truncated manuscripts are never approved by the preview gate');
assert.match(previewFn,/\.file\(sourcePath\)\.exists\(\)/,'Reject a missing PDF before issuing a review receipt');
assert.match(previewFn,/ref\.collection\('adminReviewEvidence'\)\.doc\(admin\.uid\)/,'Bind evidence to the exact reviewer');
assert.match(previewFn,/transaction\.get\(ref\)/,'Preview evidence checks the current manuscript revision');
assert.match(previewFn,/contentRevision:Number\(data\.contentRevision \?\? 0\)/);
assert.match(adminReview,/const sourceReviewed = input\.sourceReviewed === true/,'Admin must explicitly confirm review');
assert.match(adminReview,/const evidence = await transaction\.get\(ref\.collection\('adminReviewEvidence'\)\.doc\(admin\.uid\)\)/,'Validate proof in same approval transaction');
assert.match(adminReview,/proof\.contentRevision !== Number\(data\.contentRevision \?\? 0\)/,'Stale manuscript version must not pass');
assert.match(adminReview,/proof\.sourcePath !== cleanText\(data\.originalUpload\?\.storagePath,500\)/,'Replaced source cannot use old preview evidence');
assert.match(adminReview,/Date\.now\(\)-issued > 30\*60\*1000/,'Preview expires after thirty minutes');
assert.match(queue,/I opened and reviewed the complete protected manuscript/,'Require human confirmation from reviewer');
assert.match(queue,/!completeSourceReady \|\| !sourceReviewed \|\| decisionBusy/,'Approval button blocked until complete source reviewed');
assert.match(client,/sourceReviewed: boolean/,'Send explicit review acknowledgement to backend');
assert.match(app,/adminReviewScript\(script\.id, decision, note, sourceReviewed\)/,'Forward acknowledgement through the Admin app');

assert.match(adminReview, /status:nextStatus/);
assert.match(adminReview, /listing\.visibility === 'marketplace' && Boolean\(listing\.synopsis\.trim\(\)\)/);
assert.doesNotMatch(adminReview, /transaction\.set\(ref,\s*\{[^}]*marketplace:/);

assert.match(editorReview, /awaitingAdminApproval = status === 'Approved'/);
assert.match(editorReview, /normaliseScriptMarketplace\(data\.marketplace\)\.visibility === 'marketplace'/);
assert.match(editorReview, /nextStatus = awaitingAdminApproval \? 'Under review' : status/);
assert.match(editorReview, /This manuscript is no longer open for editorial review/);
assert.match(listing, /\['Approved','Published'\]/);
assert.match(client, /getAdminScriptReview/);
assert.match(client, /adminReviewWriterScript/);

assert.match(queue, /Awaiting admin review/);
assert.match(queue, /pendingStatus\(item\.status\)/);
assert.match(queue, /Open read-only viewer/);
assert.match(queue, /window\.confirm\('No public synopsis is saved/);
assert.match(queue, /Approve manuscript/);
assert.match(queue, /Request changes/);
assert.match(queue, /Reject with reason/);
assert.doesNotMatch(queue, /Optional: assign an Audio Editor/);
assert.doesNotMatch(queue, /onAssignEditor|assigningId|editors\.map/);
assert.match(queue, /role="dialog" aria-modal="true"/);
assert.match(queue, /manuscript-admin-reader copy-locked/);
assert.match(queue, /onCopy=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(queue, /manuscript-admin-reader-pdf/);
assert.match(queue, /openPreview\(item\)/);
assert.match(queue, /read-only in-app viewer/);
assert.doesNotMatch(queue, /Open uploaded .*target="_blank"/);
assert.doesNotMatch(app, /AdminManuscriptReview scripts=\{adminScripts\} editors=/);
assert.match(api, /extractDocxReviewText/);
assert.match(api, /adminSourcePreview/);
assert.match(api, /normaliseScriptMarketplace\(doc\.data\(\)\.marketplace\)\.visibility !== 'marketplace'/);
assert.match(api, /Marketplace manuscripts are reviewed directly by NightJar administrators, without editorial assignment/);
assert.match(api, /Marketplace manuscript decisions belong to NightJar administrators/);
assert.match(queue, /setSelectedId\(null\)/);
assert.match(queue, /getAdminScriptReview|adminScriptPreview/);
assert.match(app, /AdminManuscriptReview scripts=\{adminScripts\}/);
assert.match(app, /reviewAdminManuscript/);
assert.match(app, /Review rights & submit/);
const rightsPanel = readFileSync('src/components/WriterRightsPanel.tsx', 'utf8');
assert.match(rightsPanel, /Submit privately for NightJar review/);
assert.match(rightsPanel, /submitManuscript\(\)/);
assert.doesNotMatch(rightsPanel, /rights-ai-lock|AI training permission: OFF|Nightjar keeps AI-training permission off/);
assert.match(rightsPanel, /aiTrainingAllowed: false/, 'AI-training permission must remain hard-disabled in persisted rights');
assert.match(rightsPanel, /nightjarScripts.updateRights\(script.id/);
assert.match(rightsPanel, /List approved script for creators/);
assert.match(app, /result.script\?\.status !== 'Submitted'/);
assert.match(app, /submitManuscript=\{submitWriterScript\}/);
assert.match(app, /Awaiting admin review/);
assert.doesNotMatch(app, />Submit to editorial<\/button>/);

assert.match(app, /!writerDetailOpen\s*\? <WriterManuscriptGrid scripts=\{writerScripts\}/,
  'Writer library opens as a responsive grid, not a sidebar and doom-scroll editor');
assert.match(app, /setWriterDetailOpen\(true\)/,
  'tapping manuscript title opens focused details and editing');
assert.match(app, /Back to manuscripts/,
  'Writer has a clear way back from full manuscript detail');
assert.match(app, /writerEditDirty && !window\.confirm\('This manuscript still has unsaved changes/,
  'leaving Writer details cannot silently discard unsaved work');
assert.match(grid, /aria-label=\{`Open \$\{title\}\. Status: \$\{status\.label\}`\}/,
  'each manuscript grid card is an accessible real button with its status');
assert.match(grid, /Awaiting review|Changes requested|Approved/,
  'Writer grid shows review state in plain language');
assert.match(grid, /type="search"/,
  'large libraries can find saved manuscripts by name or status');
assert.match(gridStyles, /grid-template-columns:repeat\(auto-fit,minmax/,
  'tablet library is a genuine responsive multi-column grid');
assert.match(gridStyles, /@media\(max-width:680px\)/,
  'phone layout must collapse to one comfortable touch column');
assert.match(gridStyles, /focus-visible/,
  'keyboard focus remains visible across Writer manuscript cards');
console.log('Manuscript direct admin review, editorial removal and read-only viewer contracts PASS');
