import assert from 'node:assert/strict';
import fs from 'node:fs';

// Release integration contracts are source-level regression checks.
// Emulator tests and device QA are still required before a live deployment.
const read = (path) => fs.readFileSync(path, 'utf8');
const backend = read('functions/src/index.ts');
const app = read('src/App.tsx');
const entry = read('src/main.tsx');
const storage = read('storage.rules');
const hosting = JSON.parse(read('firebase.json'));
const sourceBetween = (first, last) => {
  const begin = backend.indexOf(first);
  const end = backend.indexOf(last, begin);
  assert.ok(begin >= 0 && end > begin, 'Missing source boundaries: ' + first);
  return backend.slice(begin, end);
};

const edit = sourceBetween('export const adminManageProfessionalRoles = onCall', 'export const reviewProfessionalApplication = onCall');
const approve = sourceBetween('export const reviewProfessionalApplication = onCall', '// NIGHTJAR_ADMIN_EMAIL_COMMUNICATIONS_V1');
for (const region of [edit, approve]) {
  assert.ok(region.includes('await requireProfessionalLegalTerms(userId)'), 'grants require contributor legal acceptance');
  assert.ok(region.includes('await requireAgeVerified(userId)'), 'grants require validated adult access');
  assert.ok(region.includes("account.status === 'suspended'"), 'grants deny suspended accounts');
  assert.ok(region.includes('db.runTransaction'), 'approval and grant are atomic');
  assert.ok(region.includes('tx.create(eventDocument'), 'grant action creates one audit event transactionally');
}
assert.ok(!approve.includes("status: 'active'"), 'approvals must not silently restore account status');
assert.ok(edit.includes('sameRoles(previouslyApproved, expected)'), 'multi-role grant uses concurrency guard');
assert.ok(!edit.includes('tx.set(profileRef'), 'role changes preserve portfolios');

const ownerActions = sourceBetween('const adminActionNotifications = async () =>', 'export const listNotifications = onCall');
for (const name of ['professionalApplications', 'imageAssets', 'releases', 'releaseReviews']) {
  assert.ok(ownerActions.includes(name), 'live Owner action queue missing ' + name);
}
assert.ok(backend.includes('identity.admin ? await adminActionNotifications()'), 'alerts are Owner-only');
assert.ok(app.includes('item.actionRequired !== true'), 'live alerts cannot be bulk dismissed');
assert.ok(app.includes("item.type === 'admin_action' && canAdmin"), 'Owner alerts deep-link to authorised workpages');

assert.ok(entry.includes('isLegalCentre ? <LegalCentrePage />'), 'public legal hub route must exist');
assert.ok(read('src/components/LegalCentrePage.tsx').includes('NIGHTJAR_LEGAL_DOCUMENTS'), 'legal hub uses versioned beta documents');
assert.ok(hosting.hosting.rewrites[0]?.source === '/api/webhooks/didit', 'Didit webhook must precede SPA rewrite');
assert.ok(storage.includes('ownsEditableRelease(releaseId);'), 'published audio must not be deleted through client Storage SDK');
assert.ok(app.includes('onClick={() => void openAgeCheck()}'), 'Didit verification starts explicitly for the signed-in account');
assert.ok(app.includes('ageProviderVerified'), 'provider-backed verification is persisted separately from login');
console.log('Nightjar release reconciliation contracts PASS (source checks only).');
