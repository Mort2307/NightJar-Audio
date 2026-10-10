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

console.log('Nightjar protected admin multi-role and Listener upgrade contracts passed.');
