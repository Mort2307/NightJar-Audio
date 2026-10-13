import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync('functions/src/index.ts', 'utf8');
const alerts = readFileSync('functions/src/admin-attention.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const client = readFileSync('src/platform/firebase-scripts.ts', 'utf8');
const queue = readFileSync('src/components/AdminManuscriptReview.tsx', 'utf8');

const submit = api.slice(api.indexOf('export const submitWriterScript ='), api.indexOf('export const listEditorQueue ='));
const adminReview = api.slice(api.indexOf('export const adminReviewWriterScript ='), api.indexOf('export const adminAssignEditor ='));
const editorReview = api.slice(api.indexOf('export const reviewEditorScript ='), api.indexOf('export const listEditorAccounts ='));
const listing = api.slice(api.indexOf('export const listScriptMarketplace ='), api.indexOf('export const expressScriptInterest ='));

assert.match(submit, /status: 'Submitted'/);
assert.match(submit, /rights\.ownershipAttested !== true \|\| rights\.contributorPermissionsConfirmed !== true/);
assert.match(api, /where\('status', 'in', \['Submitted','Under review'\]\)/, 'Submitted and assigned scripts count toward admin actions');
assert.match(api, /count:scriptQueue\.docs\.length, label:'manuscript awaiting admin review'/);
assert.match(alerts, /case 'scripts': return \['Submitted','Under review'\]\.includes\(status\)/);
assert.match(alerts, /Manuscript awaiting NightJar approval/);

assert.match(adminReview, /requireAdminIdentity\(request\)/);
assert.match(adminReview, /\['Submitted','Under review'\]/);
assert.match(adminReview, /transaction\.set\(ref, \{/);
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
assert.match(queue, /Open protected manuscript/);
assert.match(queue, /window\.confirm\('No public synopsis is saved/);
assert.match(queue, /Approve manuscript/);
assert.match(queue, /Request changes/);
assert.match(queue, /Reject with reason/);
assert.match(queue, /Optional: assign an Audio Editor/);
assert.match(queue, /setSelectedId\(null\)/);
assert.match(queue, /getAdminScriptReview|adminScriptPreview/);
assert.match(app, /AdminManuscriptReview scripts=\{adminScripts\}/);
assert.match(app, /reviewAdminManuscript/);
assert.match(app, /Submit for marketplace approval/);
assert.match(app, /Awaiting admin review/);
assert.doesNotMatch(app, />Submit to editorial<\/button>/);

console.log('Manuscript direct admin moderation and marketplace review contracts PASS');
