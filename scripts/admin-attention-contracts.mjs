import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/admin-attention.ts','utf8');
const index = fs.readFileSync('functions/src/index.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const preferences = fs.readFileSync('src/components/AdminAttentionPreferences.tsx','utf8');
const userPreferences = fs.readFileSync('src/components/NotificationPreferences.tsx','utf8');
const client = fs.readFileSync('src/platform/firebase-notifications.ts','utf8');
const workflow = fs.readFileSync('.github/workflows/firebase-backend-deploy.yml','utf8');
const categories = [
  'professionalApplications','releases','scripts','images','reviews',
  'editorPortfolio','reports','security','suggestions','billing',
];

assert.match(backend,/email_verified\s*!==\s*true/,'only email-verified administrators use preference callable');
assert.match(backend,/ADMIN_EMAILS\.includes/,'backend role verification uses the owner allowlist');
assert.match(backend,/getAuth\(\)\.getUserByEmail\(email\)/,'push targets authenticated owner identities');
assert.match(backend,/onDocumentWritten/,'writes are observed server-side, not via client polling');
assert.match(backend,/notificationRef\.create\(/,'create-only notification writes deduplicate events');
assert.match(backend,/if \(!preferences\[category\]\) return/,'muting push does not discard in-app notifications');
assert.match(backend,/adminAttentionPreferencesUpdatedAt/,'admin settings persist independently');
assert.match(backend,/Nightjar Administrator/,'lock screen does not expose flagged text or user identities');
assert.doesNotMatch(backend,/snapshotText|reason:reason|sendEmail\(/,'no flagged evidence or sensitive details go in the push alert');

for (const key of categories) {
  assert.ok(backend.includes(key + ': { title:'),'admin notification category exists: '+key);
  assert.ok(preferences.includes("key: '" + key + "'"),'admin-only setting exists: '+key);
}
for (const functionName of [
  'getAdminAttentionPreferences','saveAdminAttentionPreferences',
  'adminAttentionProfessionalApplications','adminAttentionReleases','adminAttentionScripts',
  'adminAttentionImages','adminAttentionReviews','adminAttentionEditorPortfolio',
  'adminAttentionReports','adminAttentionSecurity','adminAttentionSuggestions','adminAttentionBilling',
]) {
  assert.ok(index.includes(functionName),'missing backend export '+functionName);
  assert.ok(workflow.includes(functionName),'scoped owner backend deployment excludes '+functionName);
}
assert.match(client,/adminPreferences\(\)/,'client reads owner preferences');
assert.match(client,/saveAdminPreferences\(preferences:/,'client saves owner preferences');
assert.match(userPreferences,/isAdministrator && !simulationMode && <AdminAttentionPreferences/,'normal user accounts cannot see owner settings');
assert.match(app,/isAdministrator=\{canAdmin && !demoMode && !simulationMode && !liveRolePreview\}/,'only real owner context mounts preferences');
assert.match(app,/item\.type === 'admin_attention'/,'owner alerts route to review pages');
assert.match(app,/item\.type === 'admin_attention'\) await markNotificationRead/,'persistent alerts can be acknowledged');
assert.match(app,/item\.subtype === 'report_review'/,'reports route to moderator');
assert.match(app,/item\.subtype === 'security_alert'/,'security alerts route to Safety');
assert.match(workflow,/workflow_dispatch:/,'new functions use the explicitly approved production backend workflow');
assert.doesNotMatch(workflow,/^\s+push:/m,'backend deployment must not bypass owner-approved workflow identity');
assert.match(workflow,/environment: production-backend/,'backend retains protected production environment');

console.log('Nightjar administrator attention: secure owner-only preferences, push events, queue routes and scoped deployment contracts PASS');
