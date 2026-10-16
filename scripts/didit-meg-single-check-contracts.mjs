import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts','utf8');
const didit = fs.readFileSync('functions/src/didit.ts','utf8');
const client = fs.readFileSync('src/platform/firebase-age.ts','utf8');
const member = fs.readFileSync('src/components/ControlledSingleMemberDiditCheck.tsx','utf8');
const settings = fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const workflow = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');

const start = backend.indexOf('// One explicitly authorised, user-initiated normal live Didit check');
const end = backend.indexOf('export const getAdminReleasePreviewUrl',start);
assert.ok(start>0 && end>start,'one-shot maintenance pilot isolated from public starter');
const code = backend.slice(start,end);
const publicStarter=backend.split('export const startAgeAssurance = onCall')[1]?.split('export const adminAgeTestPass')[0]||'';

assert.match(backend,/const DIDIT_VERIFICATION_PAUSED = true/,'public pause stays enabled');
assert.match(backend,/const TESTING_AGE_ASSURANCE_BYPASS = false/,'temporary beta age bypass is disabled after verified-18+ rollout');
assert.match(publicStarter,/if \(DIDIT_VERIFICATION_PAUSED && !controlledAdminTest\)/,
 'global public starter remains blocked');
assert.match(code,/isMegDiditMaintenanceMember\(identity\)/,'server identifies the specifically authorised member');
assert.match(code,/identity\.admin && cleanEmail\(identity\.email\) === MEG_DIDIT_MAINTENANCE_EMAIL/,
 'email + admin role are authenticated server-side, not user-supplied');
assert.match(code,/requireActiveIdentity\(request\)/,'callables are authenticated');
assert.match(code,/singleMemberDiditMaintenanceStatus = onCall/,'read-only member pilot status is available');
assert.match(code,/startSingleMemberDiditMaintenanceCheck = onCall/,'separate gated controlled check is available');
assert.match(code,/consentsToNewPaidCheck !== true/,'fresh ID and possible cost must be explicitly authorised');
assert.match(code,/await requireCurrentLegalAcceptance\(identity\.uid, 'age_assurance_notice'\)/,
 'server enforces current age notice acknowledgement before KYC');
assert.match(code,/diditMode\(\) !== 'live'/,'never confuse sandbox and real checks');
assert.match(code,/!DIDIT_VERIFICATION_PAUSED/,'one-shot privilege must not persist after launch');
assert.match(code,/!DIDIT_LIVE_PILOT_ADMINS_ONLY/,'one-shot privilege valid only during beta lock');
assert.match(code,/memberConsent !== true/,'previous support request consent is required');
assert.match(code,/approved_for_reuse/,'owner-approved request is prerequisite');
assert.match(code,/diditPass\(age\)/,'already verified members are not billed again');
assert.match(code,/const MEG_DIDIT_MAINTENANCE_CONTROL = 'didit-meg-one-live-check-2026-10-15'/,
 'single attempt uses distinct durable one-time guard');
assert.match(code,/await db\.runTransaction\(async tx =>/,'one-attempt claim is atomic');
assert.match(code,/transactional|Concurrent tabs/i,'one-use claim explains race safety');
assert.match(code,/tx\.create\(guardRef,/,'single-attempt guard is created before touching Didit');
assert.ok(code.indexOf('tx.create(guardRef,') < code.lastIndexOf('return startDiditSession(identity.uid);'),
 'charged Didit session cannot start before the guard is durably recorded');
assert.match(code,/guardSnap\.exists/,'subsequent attempts can resume or fail closed');
assert.match(code,/megMaintenanceSession\(identity\.uid, age\)/,'a claimed attempt only resumes linked existing Didit session');
assert.match(code,/previous\.uid !== uid \|\| previous\.workflowId !== DIDIT_WORKFLOW_ID\.value\(\)/,
 'resume link must belong to authenticated member and same workflow');
assert.match(code,/\['verify.didit.me','verification.didit.me'\]\.includes\(url\.hostname\)/,
 'resume URL must be Didit-hosted HTTPS');
assert.match(code,/Nightjar-linked Didit session needs support review/i,'existing check blocks duplicate billing');
assert.doesNotMatch(code,/status:\s*'COMPLETE'\s*,\s*verified:\s*true|tx\.set\(ageRef.*verified:\s*true/,
 'maintenance pilot never grants adult access on its own');
assert.match(didit,/uid !== payload\.vendorData/,'signed webhook must match Nightjar UID');
assert.match(didit,/payload\.adultEvidence === true/,'signed webhook requires actual adult documentary evidence');
assert.match(client,/singleMemberMaintenanceStatus/,'authenticated client can read invitation');
assert.match(client,/startSingleMemberMaintenanceCheck/,'member can start exactly one voluntary session');
assert.match(member,/nightjarLegal\.accept/,'client records versioned age notice acceptance');
assert.match(member,/window\.confirm/,'member reconfirms real paid ID session');
assert.match(member,/!consent/,'client requires affirmative consent');
assert.match(member,/Open my existing Didit session/,'interrupted provider visits resume same session');
assert.match(member,/status\?\.providerVerified/,'success is backed by actual server provider verified status');
assert.match(settings,/administrator && !simulationMode && email\?\.trim\(\)\.toLowerCase\(\) ===/,
 'maintenance UI is limited to an administrator account');
assert.match(settings,/<ControlledSingleMemberDiditCheck\/>/,'pilot control is in the member own Settings');
assert.match(workflow,/\[nightjar-meg-didit-single-release\]/,'backend-first gated deploy protects new UI');
console.log('Controlled one-use signed-in Meg Didit check: consent, global pause, durable charge guard and account-binding PASS.');
