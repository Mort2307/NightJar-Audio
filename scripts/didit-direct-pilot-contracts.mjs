// Read-only, no-provider-call release contracts for Nightjar account-wide Didit.
// Never create sessions, update Firestore or deploy production resources.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts','utf8');
const app = fs.readFileSync('src/App.tsx','utf8');
const settings = fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const panel = fs.readFileSync('src/components/DiditControlledLiveCheck.tsx','utf8');
const client = fs.readFileSync('src/platform/firebase-didit-controlled.ts','utf8');
const workflow = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const begin = backend.indexOf('// Closed-beta, ONE-USE normal live KYC:');
const end = backend.indexOf('// Reusable KYC preparation:',begin);
assert.ok(begin >= 0 && end > begin, 'account-check route remains isolated');
const code = backend.slice(begin,end);
const status = code.slice(code.indexOf('export const myDiditControlledCheck = onCall'),
  code.indexOf('export const startMyDiditControlledCheck = onCall'));
const start = code.slice(code.indexOf('export const startMyDiditControlledCheck = onCall'));

assert.match(backend,/const DIDIT_VERIFICATION_PAUSED = true/,'legacy public starter remains paused');
assert.match(app,/const DIDIT_VERIFICATION_PAUSED = true/,'legacy age-gate starter remains paused');
assert.match(code,/const DIDIT_ACCOUNT_SELF_SERVICE_ENABLED = true/,'new account-level option is explicitly enabled');
assert.match(code,/const accountDiditSelfServiceEligible = \(\) =>/,'account-wide eligibility helper is defined');
assert.doesNotMatch(code,/megan\.wright666|directDiditPilotAccount|identity\.admin && identity\.email/,
  'eligibility must not be limited to Meg or administrators');
assert.match(backend,/const requireActiveIdentity = async/,'shared authentication and access policy exists');
assert.match(backend,/await requireClosedBetaAccess\(identity\.email, account\)/,
  'private beta access remains enforced');
assert.match(backend,/if \(account\.status === 'suspended'\)/,'suspended accounts are denied');
assert.match(backend,/account\.acceptedPlatformTermsVersion !== CURRENT_LEGAL_DOCUMENTS\.platform_terms\.version/,
  'terms must be current');
assert.match(status,/requireActiveIdentity\(request\)/,'status is scoped to authenticated account');
assert.match(status,/accountDiditSelfServiceEligible\(\)/,'status includes all eligible users');
assert.match(status,/selfServiceEnabled \? 'authorised' : 'none'/,'eligible users get an offer without old enquiry');
assert.match(status,/existingPending && selfServiceEnabled/,'existing provider sessions preempt new invitations');
assert.match(status,/previous\.uid === identity\.uid/,'resume session is UID-bound');
assert.match(status,/parsed\.protocol === 'https:'/,'resumed provider URL must be HTTPS');
assert.match(status,/\['verify\.didit\.me','verification\.didit\.me'\]\.includes\(parsed\.hostname\)/,
  'resumed provider URL must use an allowlisted host');
assert.match(status,/!providerVerified && status === 'authorised'/,'verified users are never offered a new start');
assert.doesNotMatch(status,/startDiditSession/,'status checks do not start paid Didit sessions');
assert.match(start,/requireActiveIdentity\(request\)/,'start requires active authenticated user');
assert.match(start,/diditMode\(\) !== 'live'/,'sandbox never masquerades as live KYC');
assert.match(start,/explicitConsent !== true/,'member explicitly consents');
assert.match(start,/await requireCurrentLegalAcceptance\(identity\.uid, 'age_assurance_notice'\)/,
  'current age privacy notice is accepted and recorded server-side');
assert.match(start,/\['CREATING','PENDING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'\]\.includes/,
  'old pending checks block duplicate provider billing');
assert.match(start,/if \(!selfServiceEnabled && \(consent\.data\(\)\?\.status !== 'approved_for_reuse'/,
  'only non-self-service legacy invitations require an older review');
assert.match(start,/if \(!grant\.exists && !selfServiceEnabled\)/,'no self-authorisation if access is disabled');
assert.match(start,/grant\.exists && \(grant\.data\(\)\?\.state !== 'authorised' \|\| grant\.data\(\)\?\.attempts !== 0\)/,
  'consumed attempts cannot restart');
assert.match(start,/tx\.create\(grantRef, \{/,'new account attempt has a durable transactional claim');
assert.match(start,/state:'claimed', attempts:1/,'claims consume the single permitted attempt');
assert.ok(start.indexOf('tx.create(grantRef,') >= 0 &&
  start.indexOf('tx.create(grantRef,') < start.indexOf('await startDiditSession(identity.uid)'),
  'attempt must be claimed BEFORE any billable API request');
assert.match(start,/state:'requires_review'/,'ambiguous provider errors require support review');
assert.doesNotMatch(start,/tx\.set\(ageRef.*verified:\s*true|status:\s*'COMPLETE'\s*,\s*verified:\s*true/,
  'self-service never fabricates an age pass');
assert.match(panel,/window\.confirm\(/,'member must reconfirm ID and possible charge');
assert.match(panel,/nightjarDiditControlled\.start\(\)/,'only explicit member click starts provider session');
assert.match(panel,/No earlier Didit approval request/,'members do not need old reuse applications');
assert.match(client,/selfServiceEnabled\?: boolean/,'client receives server-scoped rollout status');
assert.match(settings,/<DiditControlledLiveCheck \/>/,'verification is available from member Settings');
assert.match(app,/<DiditControlledLiveCheck onVerified=/,'verification is available at the age gate and reconnects after a successful check');
assert.match(workflow,/\[nightjar-didit-all-members-release\]/,'only tagged main release dispatches backend deploy');
assert.match(workflow,/myDiditControlledCheck,startMyDiditControlledCheck/,
  'both account callables deploy before Hosting');
console.log('Nightjar all-member Didit self-service: auth, age-gate access, consent, one-use claims and deployment safety PASS.');
