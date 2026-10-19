import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const backend = readFileSync('functions/src/index.ts', 'utf8');
const hosting = readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');
const start = backend.indexOf('const approvedWorkThankYou = async');
const end = backend.indexOf('// Moderation feedback is a genuine administrator-authored message', start);
assert.ok(start > 0 && end > start, 'Server-side thank-you renderer must exist');
const thanks = backend.slice(start, end);
assert.match(thanks, /profileRef\(userId\)\.get\(\)/, 'Use member-owned profile');
assert.match(thanks, /profile\.data\(\)\?\.displayName/, 'Prefer chosen display name');
assert.match(thanks, /account\.data\(\)\?\.displayName/, 'Account display name is safe fallback');
assert.match(thanks, /profile\.data\(\)\?\.handle/, 'Public handle is the last personalised fallback');
assert.doesNotMatch(thanks, /email\.split|auth\.token|didit|gmailAccessToken|generateContent|callGemini|openai/i, 'Do not infer names from private data or AI');
assert.match(thanks, /scheduled\s*\?/, 'Scheduled releases must not be called live');
assert.match(thanks, /remain private until publication/, 'Preserve schedule privacy');
assert.match(thanks, /chosen Marketplace visibility/, 'Writer approval must not assume automatic listing');
assert.match(thanks, /The NightJar Team/, 'Message should be personally signed');
for (const kind of ['audio', 'manuscript', 'editor', 'artwork']) {
  assert.match(thanks, new RegExp("'"+kind+"'"), 'Thank every contributor type: '+kind);
}
const editor = backend.slice(backend.indexOf('export const moderateEditorPortfolioItem ='),backend.indexOf('export const getEditorPortfolioAudioUrl ='));
const writer = backend.slice(backend.indexOf('export const adminReviewWriterScript ='),backend.indexOf('// Manuscript-specific review correspondence'));
const release = backend.slice(backend.indexOf('export const moderateRelease ='),backend.indexOf('export const ',backend.indexOf('export const moderateRelease =') + 20));
const image = backend.slice(backend.indexOf('export const moderateImageAsset ='),backend.indexOf('export const getImageAssetStatus ='));
assert.match(editor, /decision === 'approved'[\s\S]*?approvedWorkThankYou\(result\.ownerUserId, 'editor'/);
assert.match(writer, /decision === 'approved'[\s\S]*?approvedWorkThankYou\(result\.writerUserId, 'manuscript'/);
assert.match(release, /decision === 'approved'[\s\S]*?approvedWorkThankYou\(String\(data\.creatorUserId\), 'audio', data\.title, scheduled\)/);
assert.match(release, /const body = decision === 'approved'[\s\S]*?thankYou/, 'Creator moderation inbox should say thanks too');
assert.match(image, /asset\.kind==='artist_portfolio'[\s\S]*?approvedWorkThankYou\(String\(asset\.ownerUserId\),'artwork'/,'Artist approval still personally thanks the creator');
assert.match(image, /const artistThankYou =/, 'Generic avatar/image approvals do not generate work thank-you');
const notifier = backend.slice(backend.indexOf('const createNotification = async'),backend.indexOf('// Personal appreciation is composed only after a successful Admin approval.'));
assert.match(notifier, /payload\.approvedWorkThankYou === true \? payload : safePayload/, 'Signed-in inbox retains personalised thank-you');
assert.match(notifier, /delete persistedPayload\.approvedWorkThankYou/, 'Do not store internal rendering flag');
assert.match(notifier, /deliverPushNotification\(userId, safePayload, displayMode/, 'Discreet/minimal lock-screen push must remain redacted');
for(const section of [editor,writer,release,image]) assert.match(section, /approvedWorkThankYou:Boolean\(/, 'Approved content marks its private in-app thank-you');
const gate = hosting.slice(hosting.indexOf('- name: Deploy personal contributor thank-yous before Hosting'), hosting.indexOf('# Deploy paged Admin release queries'));
assert.ok(gate.includes('gh api -X POST'), 'Approval gate dispatches an existing targeted deployment');
assert.doesNotMatch(gate, /\\\\\n/, 'Shell line continuation must contain one backslash, not two');
assert.match(hosting, /\[nightjar-work-thanks-release\]/, 'Production backend-first release gate is required');
for (const fn of ['moderateRelease','moderateEditorPortfolioItem','adminReviewWriterScript','moderateImageAsset']) {
  assert.ok(hosting.includes(fn), 'Backend release must select '+fn);
}
console.log('PASS personalised approved-work thank-you for Creator, Writer, Editor and Artist');
