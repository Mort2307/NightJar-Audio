import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual production decision functions against meaningful state
// changes, not a copied implementation or a source-regex-only simulation.
// No Firebase credentials, network, data writes or phone messages are needed.
const backend = fs.readFileSync('functions/src/admin-attention.ts', 'utf8');

const extract = (from, to) => {
  const start = backend.indexOf(from);
  const end = backend.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing Nightjar policy: ${from}`);
  return backend.slice(start, end);
};

const run = (source, globals = {}) => {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    reportDiagnostics: true,
  });
  assert.equal(javascript.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length ?? 0, 0);
  const context = vm.createContext({ ...globals });
  vm.runInContext(javascript.outputText, context, { timeout: 1000 });
  return context;
};

const transitions = extract('const isPending = ', 'const notifyAdmin = ');
const policy = run(transitions + '\nglobalThis.__policy = { isPending, newAttention };').__policy;
assert.ok(policy?.isPending && policy?.newAttention, 'Production transition functions loaded');

const pendingApplication = {
  status: 'banked',
  requestedRoles: ['creator', 'writer'],
  approvedRoles: [],
};
const checked = (name, category, before, after, expected) => {
  assert.equal(policy.newAttention(category, before, after), expected, name);
};
checked('fresh application alerts', 'professionalApplications', undefined, pendingApplication, true);
checked('duplicate event after status remains pending does not alert', 'professionalApplications',
  pendingApplication, { ...pendingApplication, updatedAt: 42 }, false);
checked('editing the application statement does not alert', 'professionalApplications',
  pendingApplication, { ...pendingApplication, statement: 'updated' }, false);
checked('a new unapproved role is new work', 'professionalApplications',
  pendingApplication, { ...pendingApplication, requestedRoles: ['creator','writer','artist'] }, true);
checked('role order alone never alerts', 'professionalApplications',
  pendingApplication, { ...pendingApplication, requestedRoles: ['writer','creator'] }, false);
checked('fully approved application never alerts', 'professionalApplications', pendingApplication,
  { ...pendingApplication, approvedRoles: ['creator','writer'] }, false);
checked('reopen with newly requested role alerts', 'professionalApplications',
  { ...pendingApplication, approvedRoles: ['creator','writer'] },
  { ...pendingApplication, requestedRoles: ['creator','writer','editor'], approvedRoles: ['creator','writer'] }, true);

const cases = [
  ['releases', { status:'pending_review' }],
  ['scripts', { status:'Submitted' }],
  ['images', { status:'pending' }],
  ['reviews', { status:'pending' }],
  ['editorPortfolio', { status:'pending_review' }],
  ['reports', { status:'open' }],
  ['security', { status:'open' }],
  ['suggestions', { status:'new' }],
  ['billing', { status:'past_due' }],
];
for (const [category, after] of cases) {
  checked(category + ' creates one attention item', category, undefined, after, true);
  checked(category + ' pending edit does not create a duplicate', category, after,
    { ...after, description:'ordinary update' }, false);
  checked(category + ' completed item does not create an alert', category, after,
    { ...after, status:'resolved' }, false);
}
checked('assigned editorial scripts no longer alert', 'scripts', undefined,
  { status:'Submitted', editorUserId:'assigned-editor' }, false);

// The callable permission check is executed with mock credentials. This does
// not substitute for a live permission-denied Firebase integration test.
class FakeHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const authCode = extract('const adminIdentity = ', 'export const getAdminAttentionPreferences = ');
const auth = run(authCode + '\nglobalThis.__check = adminIdentity;', {
  HttpsError: FakeHttpsError,
  ADMIN_EMAILS: ['owner@nightjar.test'],
  clean: value => String(value ?? '').trim().toLowerCase(),
}).__check;
const verified = { auth: { uid:'owner-uid', token:{ email:'OWNER@NIGHTJAR.TEST', email_verified:true } } };
assert.equal(auth(verified).uid, 'owner-uid', 'verified allowlisted account can manage attention preferences');
for (const [label, request, code] of [
  ['anonymous visitor', {}, 'unauthenticated'],
  ['unverified owner', { auth:{ uid:'owner', token:{ email:'owner@nightjar.test', email_verified:false } } }, 'permission-denied'],
  ['ordinary signed-in member', { auth:{ uid:'member', token:{ email:'listener@nightjar.test', email_verified:true } } }, 'permission-denied'],
  ['email without verified claim', { auth:{ uid:'owner', token:{ email:'owner@nightjar.test' } } }, 'permission-denied'],
]) {
  assert.throws(() => auth(request), error => error?.code === code, label);
}

// Source guards for effects that cannot safely run in the offline test.
assert.match(backend, /getAuth\(\)\.getUserByEmail\(email\)/, 'resolve recipients using Firebase Auth');
assert.match(backend, /if \(!owner\.emailVerified/, 'do not notify unverified identities');
assert.match(backend, /await notificationRef\.create\(/, 'only the first invocation creates the inbox alert');
assert.match(backend, /if \(Number\(error\?\.code\) === 6 \|\| error\?\.code === 'already-exists'\) return;/,
  'a retried event exits without sending another phone notification');
assert.match(backend, /const key = category \+ ':' \+ recordId \+ ':' \+ extra \+ ':' \+ event\.id;/,
  'event id and work identity drive deduplication');
assert.match(backend, /if \(!preferences\[category\]\) return;/, 'admin push opt-out is respected');
assert.match(backend, /await Promise\.all\(ADMIN_EMAILS\.map\(/, 'only enumerated administrator recipients are considered');

console.log('Nightjar admin-attention behaviour PASS: verified identities, 10 categories, pending-state dedupe and re-submissions');
