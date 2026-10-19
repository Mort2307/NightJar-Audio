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
assert.doesNotMatch(thanks, /email|gmail|didit|identity|AI|Gemini|OpenAI/i, 'Do not infer names from private data or AI');
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
assert.match(image, /asset\.kind === 'artist_portfolio'[\s\S]*?approvedWorkThankYou\(String\(asset\.ownerUserId\), 'artwork'/);
assert.match(image, /const artistThankYou =/, 'Generic avatar/image approvals do not generate work thank-you');
assert.match(hosting, /\[nightjar-work-thanks-release\]/, 'Production backend-first release gate is required');
for (const fn of ['moderateRelease','moderateEditorPortfolioItem','adminReviewWriterScript','moderateImageAsset']) {
  assert.ok(hosting.includes(fn), 'Backend release must select '+fn);
}
console.log('PASS personalised approved-work thank-you for Creator, Writer, Editor and Artist');
