import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');

const start = backend.indexOf('const adminActionNotifications = async () =>');
const end = backend.indexOf('export const listNotifications', start);
assert.ok(start > 0 && end > start, 'live Owner notification summary must be present');
const summary = backend.slice(start, end);
for (const source of [
  "db.collection('professionalApplications')",
  "db.collection('imageAssets')",
  "db.collection('releases')",
  "db.collection('releaseReviews')",
]) assert.ok(summary.includes(source), 'review/verification queue is missing: ' + source);
assert.match(summary, /where\('status', 'in', \['banked','waitlist'\]\)/, 'only open application states may notify');
assert.match(summary, /\.some\(\(role\) => !approved\.has\(role\)\)/, 'already-approved professional roles must not notify');
assert.match(summary, /actionRequired:true/, 'action notices cannot be dismissed before review');
assert.match(summary, /count:item\.count/, 'notice must disclose grounded queue size, not invent counts');
assert.match(backend, /identity\.admin \? await adminActionNotifications\(\)/, 'non-admin accounts never see owner review notices');
assert.match(app, /notification\?\.actionRequired === true/, 'owner actions cannot be marked read');
assert.match(app, /item\.actionRequired !== true/, 'mark-all must never dismiss pending reviews');
assert.match(app, /item\.type === 'admin_action' && canAdmin/, 'only administrators can open owner workpages from notices');
assert.match(app, /openAdminPanel\('approvals'\)/, 'professional notices route to approval inbox');
assert.match(app, /openAdminPanel\('images'\)/, 'image notices route to verification');
assert.match(app, /openAdminPanel\('reviews'\)/, 'review notices route to moderation');
assert.match(app, /setModerationOpen\(true\)/, 'release notice routes to release moderation');
assert.match(app, /document\.addEventListener\('visibilitychange', refresh\)/, 'owner notices refresh on foregrounding the app');
assert.match(app, /180000/, 'owner summary refresh is rate-limited to three minutes');

console.log('Nightjar live Administrator approval/verification notifications contracts passed.');
