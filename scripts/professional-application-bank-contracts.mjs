import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('src/platform/professional-application-bank.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((output.diagnostics ?? []).length, 0, 'application-bank utility should transpile');
const module = { exports: {} };
new Function('module', 'exports', output.outputText)(module, module.exports);
const { classifyProfessionalApplications, filterProfessionalApplicationsByRole, pendingApplicationRoles } = module.exports;

const records = [
  { id: 'new', status: 'banked', requestedRoles: ['writer'], approvedRoles: [] },
  { id: 'partial', status: 'banked', requestedRoles: ['writer','editor'], approvedRoles: ['writer'] },
  { id: 'approved', status: 'approved', requestedRoles: [], approvedRoles: ['creator'] },
  { id: 'old-complete', status: 'banked', requestedRoles: [], approvedRoles: ['artist'] },
  { id: 'rejected', status: 'rejected', requestedRoles: [], approvedRoles: [] },
  { id: 'withdrawn', status: 'withdrawn', requestedRoles: [], approvedRoles: [] },
  { id: 'stale', status: 'banked', requestedRoles: [], approvedRoles: [] },
  { id: 'waitlisted', status: 'waitlist', requestedRoles: ['artist'], approvedRoles: [] },
  { id: 'deduped', status: 'banked', requestedRoles: ['writer','writer'], approvedRoles: ['writer'] },
];
const buckets = classifyProfessionalApplications(records);
assert.deepEqual(buckets.pending.map((x) => x.id), ['new','partial','waitlisted']);
assert.deepEqual(buckets.history.map((x) => x.id), ['approved','old-complete','rejected','withdrawn','deduped']);
assert.deepEqual(buckets.attention.map((x) => x.id), ['stale']);
assert.deepEqual(pendingApplicationRoles(records[1]), ['editor']);
assert.deepEqual(filterProfessionalApplicationsByRole(buckets.pending, 'writer').map((x) => x.id), ['new','partial']);
assert.deepEqual(filterProfessionalApplicationsByRole(buckets.history, 'creator').map((x) => x.id), ['approved']);
assert.equal(filterProfessionalApplicationsByRole(buckets.history, 'all').length, 5);

const app = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(app, /classifyProfessionalApplications\(adminApplications\)/, 'dashboard uses the same bucketing policy');
assert.match(app, /adminApplicationBox === 'history'/, 'history is accessible in the console');
assert.match(app, /adminApplicationBox === 'pending'/, 'pending queue remains accessible');
assert.match(app, /adminApplicationBox === 'attention'/, 'orphan records are visible for attention');
const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
assert.match(backend, /export const sendProfessionalApprovalEmail = onDocumentCreated/, 'approval event triggers automatic email');
assert.match(backend, /const rolesToApprove = decision === 'approved'/, 'backend has approved decision handling');
assert.match(backend, /professionalApplications\/\{userId\}\/events\/\{eventId\}/, 'approval event path is exact');
assert.match(backend, /if \(data\.decision !== 'approved'/, 'non-approvals must not send an email');
assert.match(backend, /secrets: \[NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET\]/, 'Gmail secrets must be declared');
assert.match(backend, /snapshot\.exists\) return false;/, 'an existing delivery is never automatically sent twice');
assert.match(backend, /approvalEmailStatus: 'sending'/, 'approval email status is recorded');
assert.match(backend, /export const adminRetryProfessionalApprovalEmail = onCall/, 'failed or legacy approvals can be emailed manually');
assert.match(backend, /if \(snapshot\.data\(\)\?\.status !== 'failed'\) return false;/, 'already sent messages cannot be resent using retry');
assert.match(backend, /type: 'professional_approval'/, 'successful sends produce an audit record');
assert.match(backend, /approvalEmailStatus: cleanText\(data\.approvalEmailStatus/, 'history exposes email delivery status');
assert.match(app, /Send existing approval email/, 'legacy approved profiles are offered an explicit owner action');
assert.match(app, /Retry approval email/, 'failed sends can be retried by an administrator');

console.log('Nightjar professional application inbox/history contracts passed.');
