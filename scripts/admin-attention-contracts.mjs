import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const backend = read('functions/src/admin-attention.ts');
const index = read('functions/src/index.ts');
const app = read('src/App.tsx');
const prefs = read('src/components/AdminAttentionPreferences.tsx');
const settings = read('src/components/NotificationPreferences.tsx');
const workflow = read('.github/workflows/firebase-backend-deploy.yml');
const sources = [
  ['professionalApplications','professionalApplications','adminAttentionProfessionalApplications'],
  ['releases','releases','adminAttentionReleases'],
  ['scripts','scripts','adminAttentionScripts'],
  ['images','imageAssets','adminAttentionImages'],
  ['reviews','releaseReviews','adminAttentionReviews'],
  ['editorPortfolio','editorPortfolio','adminAttentionEditorPortfolio'],
  ['reports','communityReports','adminAttentionReports'],
  ['security','securityAlerts','adminAttentionSecurity'],
  ['suggestions','creatorSuggestions','adminAttentionSuggestions'],
  ['billing','subscriptions','adminAttentionBilling'],
];
for (const [category, collection, fn] of sources) {
  assert.ok(backend.includes("  " + category + ": {"), 'Metadata missing ' + category);
  assert.ok(backend.includes("onAttentionWrite('" + category + "', '" + collection + "')"), 'Firestore trigger missing ' + category);
  assert.ok(index.includes(fn), 'Backend export missing ' + fn);
  assert.ok(workflow.includes('functions:' + fn), 'Deployment preset missing ' + fn);
  assert.ok(prefs.includes("key: '" + category + "'"), 'Admin category UI missing ' + category);
}
for (const callable of ['getAdminAttentionPreferences','saveAdminAttentionPreferences']) {
  assert.ok(index.includes(callable) && workflow.includes('functions:' + callable), 'Admin callable missing ' + callable);
}
assert.ok(workflow.includes('functions:listNotifications'), 'Live notification feed missing from deployment');
assert.match(workflow,/workflow_dispatch:/,'Backend needs explicit manual deployment');
assert.match(workflow,/DEPLOY-NIGHTJAR/,'Backend production deploy requires confirmation');
assert.match(backend,/onDocumentWritten\(/,'Admin attention must monitor real data writes');
assert.match(backend,/if \(!newAttention\(category, before, after\)\) return;/,'Pending edits must not re-notify');
assert.match(backend,/await notificationRef\.create\(/,'Attention alerts should be idempotent');
assert.match(backend,/!owner\.emailVerified/,'Only verified admin identities may receive alerts');
assert.match(backend,/getAuth\(\)\.getUserByEmail\(email\)/,'Admin list must be resolved from Auth');
assert.match(backend,/const admin = adminIdentity\(request\)/,'Preference callable must enforce admin identity');
assert.match(backend,/if \(!preferences\[category\]\) return;/,'Phone pushes must honour admin opt-out');
assert.match(backend,/type: 'admin_attention'/,'Admin alerts must have dedicated type');
assert.match(backend,/title: 'Nightjar Administrator'/,'Lock-screen wording must be discreet');
assert.match(backend,/sendEachForMulticast\(/,'FCM pushes must originate from server');
assert.match(index,/identity\.admin \? await adminActionNotifications\(\)/,'Admin queue data must not leak to members');
assert.match(app,/item\.type === 'admin_attention' && canAdmin/,'Only admins may open action notifications');
assert.match(settings,/isAdministrator && !simulationMode && <AdminAttentionPreferences/,'Normal users must not see admin preference controls');
assert.match(prefs,/nightjarNotifications\.saveAdminPreferences\(prefs\)/,'Admin preferences must persist');
assert.match(app,/item\.actionRequired !== true/,'Outstanding admin queue summaries must remain visible');
assert.match(app,/if \(url\.startsWith\('\/admin'\) && canAdmin\)/,'Push deep links must be admin-only');
console.log('Nightjar Administrator Attention contract PASS: 10 queues, verified admins, privacy, scoped rollout');
