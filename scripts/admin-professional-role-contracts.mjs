import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const backend = read('functions/src/index.ts');
const client = read('src/platform/firebase-administration.ts');
const adminWidget = read('src/components/AdminMemberRoleManager.tsx');
const manager = read('src/components/ProfessionalRoleManager.tsx');
const app = read('src/App.tsx');

const begin = backend.indexOf('export const adminManageProfessionalRoles = onCall');
const end = backend.indexOf('export const listBillingSubscriptions', begin);
assert.ok(begin > 0 && end > begin, 'secure administrator role function must exist');
const callable = backend.slice(begin, end);
assert.match(callable, /requireAdminIdentity\(request\)/, 'only administrators can change others roles');
assert.match(callable, /ADMIN_EMAILS\.has/, 'no escalation of owner accounts');
assert.match(callable, /status === 'suspended'/, 'do not grant suspended accounts professional rights');
assert.match(callable, /requireProfessionalLegalTerms\(userId\)/, 'direct grants require real user consent');
assert.match(callable, /requireAgeVerified\(userId\)/, 'direct grants require age assurance or controlled tester status');
assert.match(callable, /db\.runTransaction/, 'updates must preserve concurrent account changes');
assert.match(callable, /approvedProfessionalRoles:\s*approved/, 'approved roles are additive');
assert.match(callable, /pendingProfessionalRoles:\s*pending/, 'queued roles stay pending, not approved');
assert.match(callable, /decision:\s*action === 'approve' \? 'approved' : 'banked'/, 'approved events drive the existing email/audit pipeline');
assert.doesNotMatch(callable, /tx\.set\(targetRef,[\s\S]*?\n\s*role\s*:/, 'multi-role grants must not overwrite listener/active workspace');
assert.match(client, /adminManageProfessionalRoles/, 'frontend uses protected callable');
assert.match(adminWidget, /Approve selected roles/, 'admin can explicitly approve selected roles');
assert.match(adminWidget, /Queue selected roles/, 'admin can stage roles without granting access');
assert.match(app, /<AdminMemberRoleManager/, 'role editor is accessible from owner people directory');
assert.match(app, /openMyRolesPage/, 'Listener can access professional role upgrades directly');
assert.match(manager, /nightjarLegal\.accept/, 'existing Listeners can give their own professional consent');
assert.match(manager, /nightjarAccount\.setActiveRole/, 'member role manager still switches between approved roles');

// A member may request an additional role, but approval is exclusively Owner-controlled.
const applyStart = backend.indexOf('export const submitProfessionalApplication = onCall');
const applyEnd = backend.indexOf('export const removeProfessionalRole = onCall', applyStart);
const requestRole = backend.slice(applyStart, applyEnd);
assert.ok(applyStart > 0 && applyEnd > applyStart, 'member-request callable exists');
assert.match(requestRole, /requireActiveIdentity\(request\)/, 'member application requires an authenticated identity');
assert.match(requestRole, /requireProfessionalLegalTerms\(identity\.uid\)/, 'member request requires current terms');
assert.match(requestRole, /requireAgeVerified\(identity\.uid\)/, 'member requests require adult access');
assert.match(requestRole, /status: 'banked'/, 'member request enters the approval bank');
assert.match(requestRole, /pendingProfessionalRoles: requested/, 'member can only create pending access requests');
assert.doesNotMatch(requestRole, /status: 'approved'/, 'member cannot self-approve');

const switchStart = backend.indexOf('export const setActiveNightjarRole = onCall');
const switchEnd = backend.indexOf('export const listProfessionalApplicationBank = onCall', switchStart);
const switchRole = backend.slice(switchStart, switchEnd);
assert.match(switchRole, /!approved\.includes\(role as AccountRole\)/, 'switch must reject an unapproved role');
assert.match(switchRole, /HttpsError\('permission-denied'/, 'server rejects privilege escalation');
assert.match(manager, /Send roles for approval/, 'member interface explicitly describes administrator approval');
assert.match(manager, /Awaiting Administrator approval · workspace locked/, 'requested workspaces are visibly locked');
assert.match(manager, /nightjarAccount\.applyForProfessionalRoles\(selected/, 'member can request multiple roles');
assert.match(manager, /nightjarAccount\.setActiveRole\(role\)/, 'approved roles can be selected');

console.log('Nightjar protected admin multi-role and Listener upgrade contracts passed.');
