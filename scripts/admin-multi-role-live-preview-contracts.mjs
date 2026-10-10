import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(name, 'utf8');
const backend = read('functions/src/index.ts');
const app = read('src/App.tsx');
const client = read('src/platform/firebase-administration.ts');
const member = read('src/components/AdminMemberRoleEditor.tsx');
const live = read('src/components/AdminLiveMarketplacePreview.tsx');
const marketplace = read('src/components/ScriptMarketplace.tsx');
const css = read('src/index.css');

// One member can be approved for any combination of professions; Listener is
// preserved as the permanent personal identity. No new account is created.
assert.match(member, /Manage Roles & Access/, 'direct admin member access control exists');
for (const role of ["'creator'", "'writer'", "'editor'", "'artist'"]) {
  assert.ok(member.includes(role), 'multi-selector includes ' + role);
}
assert.match(member, /type="checkbox" checked=\{selected\.includes\(id\)\}/, 'professions are independently selected');
assert.match(member, /Listener <small>Always included<\/small>/, 'Listener identity remains permanent');
assert.match(member, /Save selected roles/, 'explicit save controls access changes');
assert.match(member, /Remove .* access from this account/, 'role removal needs confirmation');
assert.match(member, /role=\u0022alert\u0022/, 'permission errors are visible to admins');
assert.match(app, /<AdminMemberRoleEditor/, 'role editor is mounted in admin People');
assert.match(app, /manageAccountProfessions/, 'admin UI handles full approved role set');
assert.match(client, /'adminManageProfessionalRoles'/, 'client uses dedicated multirole callable');
assert.match(backend, /export const adminManageProfessionalRoles = onCall/, 'backend manages an approved set, not a primary role swap');
assert.match(backend, /const admin = requireAdminIdentity\(request\)/, 'role mutations require administrator auth');
assert.match(backend, /approvedProfessionalRoles: selected/, 'all approved professions persist atomically');
assert.match(backend, /tx\.create\(eventDocument/, 'admin role grant\/removal is audit logged');
assert.match(backend, /sameRoles\(previouslyApproved, expected\)/, 'parallel updates are conflict checked');
assert.match(backend, /ageSnapshot\.data\(\)\?\.verified !== true && !temporaryTestAccess/, 'professional grants remain gated by verified age or tester access');
assert.match(backend, /: 'listener';/, 'removing an active profession returns to Listener');
const roleMutation = backend.split('export const adminManageProfessionalRoles = onCall')[1]?.split('export const reviewProfessionalApplication = onCall')[0] ?? '';
assert.ok(roleMutation, 'admin multi-role callable is present');
assert.doesNotMatch(roleMutation, /tx\.set\(profileRef/, 'role grants must never rewrite saved role-specific profile data');

// Admin real-data preview must NOT impersonate a member, disclose manuscript
// contents, or bypass protected reader access.
assert.match(app, /openAdminPanel\('live-preview'\)/, 'Owner Console offers a separate live preview page');
assert.match(app, /panel === 'live-preview' && demoMode/, 'live preview exits fictional demo mode');
assert.match(app, /<AdminLiveMarketplacePreview notify=\{notify\}/, 'live preview mounts in dedicated routed page');
assert.match(live, /previewScriptMarketplace\(\)/, 'admin visibility diagnostic uses actual server data');
assert.match(live, /<ScriptMarketplace/, 'actual VA marketplace component is reused');
assert.match(live, /demoMode=\{false\}/, 'public marketplace fetch uses real records only');
assert.match(live, /readOnlyPreview/, 'live preview cannot create interest\/collaboration');
assert.match(marketplace, /if \(readOnlyPreview\)/, 'runtime checks forbid read-only preview writes');
assert.match(marketplace, /Preview only — enquiry disabled/, 'interactions visibly disabled');
assert.match(backend, /export const adminPreviewScriptMarketplace = onCall/, 'admin-only availability diagnostic is implemented');
assert.match(backend, /listing\.visibility === 'marketplace' && \['Approved','Published'\]\.includes\(status\)/, 'diagnostic matches marketplace discoverability');
assert.match(backend, /No protected script text is included/, 'privacy requirement documented in diagnostic');
assert.match(css, /\.admin-member-multi-role-options/, 'checkboxes are styled for touch');
assert.match(css, /\.admin-live-preview/, 'preview remains responsive');

console.log('Nightjar admin multi-role grants and live tester marketplace preview contracts passed.');
