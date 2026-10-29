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
  { id: 'new', status: 'banked', requestedRoles: ['writer'], approvedRoles: [], ageVerified: true },
  { id: 'partial', status: 'banked', requestedRoles: ['writer','editor'], approvedRoles: ['writer'], ageVerified: true },
  { id: 'unverified', status: 'banked', requestedRoles: ['writer'], approvedRoles: [], ageVerified: false },
  { id: 'unverified-partial', status: 'banked', requestedRoles: ['artist','editor'], approvedRoles: ['artist'], ageVerified: false },
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
assert.deepEqual(buckets.verification.map((x) => x.id), ['unverified','unverified-partial'], 'unverified role requests are banked, not ready for approval');
assert.deepEqual(classifyProfessionalApplications([{ id: 'verified-now', status: 'banked', requestedRoles: ['writer'], approvedRoles: [], ageVerified: true }]).pending.map((x) => x.id), ['verified-now'], 'a successful Didit refresh makes the same application actionable');
assert.deepEqual(buckets.approved.map((x) => x.id), ['approved','old-complete','deduped']);
assert.deepEqual(buckets.history.map((x) => x.id), ['rejected','withdrawn']);
assert.deepEqual(buckets.attention.map((x) => x.id), ['stale']);
assert.deepEqual(pendingApplicationRoles(records[1]), ['editor']);
assert.deepEqual(filterProfessionalApplicationsByRole(buckets.pending, 'writer').map((x) => x.id), ['new','partial']);
assert.deepEqual(filterProfessionalApplicationsByRole(buckets.approved, 'creator').map((x) => x.id), ['approved']);
assert.equal(filterProfessionalApplicationsByRole(buckets.approved, 'all').length, 3);
assert.equal(buckets.pending.length, 3, 'approved, rejected and unverified accounts never inflate actionable totals');
assert.equal(buckets.verification.length, 2, 'unverified application records stay visible without role grants');

const app = fs.readFileSync('src/App.tsx', 'utf8');
assert.match(app, /classifyProfessionalApplications\(adminApplications\)/, 'dashboard uses the same bucketing policy');
assert.match(app, /adminApplicationBox === 'history'/, 'rejected and withdrawn decision history remains accessible');
assert.match(app, /adminApplicationBox === 'approved'/, 'approved professional accounts have their own section');
assert.match(app, /label:'Already Approved'/, 'explicit Already Approved tab exists');
assert.match(app, /label:'Awaiting verification'/, 'unverified members are in a separate visible workbox');
assert.match(app, /value:applicationGroups\.pending\.length/, 'owner metric counts verified, actionable applications only');
assert.match(app, /Refresh statuses/, 'admin can re-read Didit approval status without leaving the queue');
assert.match(app, /No admin approval is needed to start their check/, 'clear member-first verification explanation');
assert.match(app, /value:applicationGroups\.pending\.length/, 'owner metric shows only new applications');
assert.match(app, /pendingApplications=\{applicationGroups\.pending\.length\}/, 'release-readiness count excludes approved accounts');
assert.match(app, /applicationGroups\.pending\.length \?/, 'owner call-to-action is hidden when nothing awaits approval');
assert.match(app, /\/admin\/['"] \+ panel/, 'admin tools use dedicated routes');
assert.match(app, /\/admin\/people\//, 'people directories use dedicated routes');
assert.match(app, /admin-detail-active/, 'owner subpage layout does not render the long dashboard behind an opened tool');
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


const roleManager = fs.readFileSync('src/components/ProfessionalRoleManager.tsx', 'utf8');
// Keep self-service application management on a dedicated, refresh-safe page.
assert.match(app, /profileRolesPage, setProfileRolesPage/, 'My Roles has explicit route state');
assert.match(app, /profile\/roles/, 'My Roles exposes a deep link');
assert.match(app, /setProfileRolesPage\(value === 'profile\/roles'\)/, 'browser back/forward restores My Roles');
assert.match(app, /view === 'profile' && profileRolesPage && \(!canAdmin \|\| interactiveRoleTest\)/, 'My Roles remains member-only except for isolated Owner role QA');
assert.match(app, /const interactiveRoleTest = role === 'admin' && simulationMode && Boolean\(previewRole\)/, 'the Owner can see member My Roles only while explicitly simulating');
assert.match(app, /onClick=\{openMyRoles\}>My Roles<\/button>/, 'top navigation has a direct My Roles action');
assert.match(app, /My Roles · Apply or switch/, 'profile hero exposes My Roles');
assert.match(app, /<ProfessionalRoleManager/, 'dedicated My Roles page loads role manager');
assert.match(roleManager, /applyForProfessionalRoles\(selected/, 'members can request several professional roles');
assert.match(roleManager, /setActiveRole\(role\)/, 'members can activate an approved role');
assert.match(roleManager, /removeProfessionalRole\(role\)/, 'members can withdraw a pending application');
assert.match(roleManager, /approvedProfessionalRoles\.includes\(role\)/, 'approved roles cannot be requested twice');
assert.match(roleManager, /pendingProfessionalRoles\.includes\(role\)/, 'pending roles cannot be requested twice');
assert.match(roleManager, /Pending Nightjar review/, 'pending roles clearly show their real status');
assert.match(roleManager, /Retry loading roles/, 'failed role fetches have an accessible retry');
assert.match(app, /decideCreatorApplication\(application, 'approved', \[role\]\)/, 'owners can approve individual requested roles');
assert.match(app, /decideCreatorApplication\(application, 'approved'\)/, 'owners can approve all requested roles');
assert.match(app, /decideCreatorApplication\(application, 'rejected'\)/, 'owners can reject outstanding roles');
assert.match(app, /application\.ageVerified !== true && application\.temporaryTestAccess !== true/, 'approval respects age-assurance or explicit QA access');

assert.match(roleManager, /Check for updates/, 'users can refresh role approval statuses without restarting');
assert.match(roleManager, /visibilitychange/, 'returning to app checks for new approvals');
assert.match(roleManager, /Confirm removal/, 'approved-role removal requires confirmation');
assert.match(app, /Approved - No pending roles/, 'archived approval labels are consistent for legacy records');
assert.match(app, /approvedRoles\.map\(roleLabel\)\.join\(' \/ '\)/, 'approved roles use reliable ASCII separators');
assert.match(app, />Approval email<\/span>/, 'approval delivery has a distinct labelled field');
assert.match(app, /Application last updated:/, 'application timestamp is distinct from email delivery timestamp');
assert.doesNotMatch(app, /Approved · no pending role/, 'legacy malformed separator no longer appears in approval archive');
assert.match(app, /className="nj-application-summary"/, 'approval summaries have separated fields instead of a concatenated line');
assert.match(app, /className="nj-application-field-label"/, 'approval information uses labelled fields');
assert.match(app, /Application last updated:/, 'activity timestamps are labelled distinctly from approval email timestamps');
assert.doesNotMatch(app, /Approved · no pending role/, 'old ambiguous composite approval label is removed');
console.log('Nightjar self-service multi-role request, review and routed workspace contracts passed.');

console.log('Nightjar professional approval counts, Already Approved archive and routed owner workpages contracts passed.');
