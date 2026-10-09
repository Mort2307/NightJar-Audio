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
console.log('Nightjar professional application inbox/history contracts passed.');
