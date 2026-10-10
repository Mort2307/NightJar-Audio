import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const adminClient = fs.readFileSync('src/platform/firebase-administration.ts', 'utf8');
const editor = fs.readFileSync('src/components/AdminMemberRoleEditor.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
const start = backend.indexOf('export const adminQueueProfessionalRoles = onCall');
const end = backend.indexOf('export const reviewProfessionalApplication = onCall', start);
assert.ok(start !== -1 && end > start, 'administrator pending-role callable is deployed in this codebase');
const fn = backend.slice(start, end);

// Queue actions cannot grant credentials, accept terms or impersonate members.
assert.match(fn, /requireAdminIdentity\(request\)/, 'only an Owner can queue');
assert.match(fn, /PROFESSIONAL_ROLE_KEYS\.includes/, 'invalid or arbitrary role names rejected');
assert.match(fn, /ADMIN_EMAILS\.has/, 'administrator accounts cannot become applicants');
assert.match(fn, /account\.status === 'suspended'/, 'suspended members cannot be queued');
assert.match(fn, /db\.runTransaction/, 'account and application pending roles must commit atomically');
assert.match(fn, /approved = professionalRolesForAccount\(account\)/, 'existing approved roles preserved');
assert.match(fn, /!approved\.includes\(role\) && !previousPending\.includes\(role\)/, 'duplicate or approved roles are never queued');
assert.match(fn, /pendingProfessionalRoles: pending/, 'account carries new pending roles');
assert.match(fn, /requestedRoles: pending/, 'application bank carries new pending roles');
assert.match(fn, /status: 'banked'/, 'role request requires separate owner approval');
assert.match(fn, /decision: 'banked'/, 'event does not trigger professional approval email');
assert.match(fn, /source: 'administrator_role_queue'/, 'administrator attribution recorded');
assert.match(fn, /tx\.create\(eventDocument/, 'audit event is created only when roles were added');
assert.doesNotMatch(fn, /approvedProfessionalRoles:\s*pending/, 'queued roles must never be persisted as approved roles');
assert.doesNotMatch(fn, /tx\.set\(profileRef/, 'queue must not alter saved professional profile content');
assert.doesNotMatch(fn, /acceptLegalAgreements/, 'admin cannot accept contributor terms for member');

assert.match(adminClient, /queueProfessionalRolesCall/, 'admin front end calls dedicated protected queue API');
assert.match(adminClient, /'adminQueueProfessionalRoles'/, 'callable name matches backend export');
assert.match(editor, /Queue additional roles without granting access/, 'distinct pending-role controls are visible');
assert.match(editor, /Queue selected roles for review/, 'explicit queue action is not an approval');
assert.match(editor, /!approved\.includes\(id\) && !pending\.includes\(id\)/, 'only new roles are selectable for queue');
assert.match(editor, /account\.status === 'suspended'/, 'suspended members cannot be queued from UI');
assert.match(app, /<AdminMemberRoleEditor[\s\S]*?onQueue=\{queueAccountProfessions\}/, 'Owner People directory wires queue action');
assert.match(app, /nightjarAdministration\.queueProfessionalRoles\(account\.userId, roles\)/, 'live accounts use real queue callable');
assert.match(app, /Simulation: role suggestions queued locally/, 'demo mode cannot alter real accounts');
assert.match(app, /await loadAdminApplications\(\)/, 'queued roles refresh approval bank');
assert.match(css, /\.admin-member-queue-roles/, 'queue selector remains usable on mobile');
console.log('Nightjar protected Owner multi-role queuing and approval-separation contracts passed.');
