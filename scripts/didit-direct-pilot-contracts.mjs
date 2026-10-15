// Source-level safeguards for Meg's direct single-use live Didit pilot.
// This test does not create provider sessions or access production Firebase.
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
assert.ok(begin >= 0 && end > begin, 'direct pilot must be isolated from other verification paths');
const code = backend.slice(begin,end);
const status = code.slice(code.indexOf('export const myDiditControlledCheck = onCall'),
  code.indexOf('export const startMyDiditControlledCheck = onCall'));
const start = code.slice(code.indexOf('export const startMyDiditControlledCheck = onCall'));

assert.match(backend,/const DIDIT_VERIFICATION_PAUSED = true/,'global verification pause must remain on');
assert.match(app,/const DIDIT_VERIFICATION_PAUSED = true/,'regular member age gate must stay paused');
assert.match(code,/DIDIT_VERIFICATION_PAUSED && identity\.admin && identity\.email === 'megan\.wright666@hotmail\.com'/,
  'only the intended verified administrator account may use the direct pilot');
assert.match(status,/requireActiveIdentity\(request\)/,'status must use the authenticated identity');
assert.match(status,/directDiditPilotAccount\(identity\)/,'status uses the server-owned account allowlist');
assert.match(status,/directPilot && !providerVerified \? 'authorised'/,'no prior reuse request is needed for the one direct pilot');
assert.match(status,/!providerVerified && status === 'authorised'/,'a verified member must not get a second verification invitation');
assert.match(status,/reuse\.data\(\)\?\.memberConsent === true/,'existing member-reuse grants keep their consent restrictions');
assert.doesNotMatch(status,/startDiditSession/,'viewing Settings or refreshing status must not start a paid verification');
assert.match(start,/requireActiveIdentity\(request\)/,'start requires an authenticated and email-verified account');
assert.match(start,/diditMode\(\) !== 'live'/,'sandbox does not count as real ID verification');
assert.match(start,/explicitConsent !== true/,'the member must explicitly opt in');
assert.match(start,/await requireCurrentLegalAcceptance\(identity\.uid, 'age_assurance_notice'\)/,
  'age-verification legal notice must be recorded server-side');
assert.match(start,/if \(!directPilot && \(consent\.data\(\)\?\.status !== 'approved_for_reuse'/,
  'only the designated direct pilot avoids old reuse prerequisites');
assert.match(start,/grant\.exists && \(grant\.data\(\)\?\.state !== 'authorised' \|\| grant\.data\(\)\?\.attempts !== 0\)/,
  'previously used or failed grants cannot be reused');
assert.match(start,/if \(!grant\.exists && !directPilot\)/,'unknown accounts cannot self-authorise a live check');
assert.match(start,/tx\.create\(grantRef, \{/,'direct pilot must atomically claim the single attempt');
assert.match(start,/state:'claimed', attempts:1/,'one attempt must be consumed in a transaction');
assert.ok(start.indexOf('tx.create(grantRef,') >= 0 &&
  start.indexOf('tx.create(grantRef,') < start.indexOf('await startDiditSession(identity.uid)'),
  'claim must happen before the billable provider API call');
assert.match(start,/state:'requires_review'/,'ambiguous provider failures never reset the one-shot grant');
assert.match(start,/throw new HttpsError\('unavailable'/,'failed live starts must require support review');
assert.doesNotMatch(start,/verified:\s*true\s*,\s*status:\s*'COMPLETE'|tx\.set\(ageRef.*verified:\s*true/,
  'the pilot must not self-approve age assurance');
assert.match(settings,/<DiditControlledLiveCheck \/>/,'member Settings contains the direct pilot panel');
assert.ok(settings.indexOf('<DiditControlledLiveCheck />') < settings.indexOf('nj-settings-master-disclosure'),
  'the panel must be available near the top and not hidden under older approvals');
assert.match(panel,/nightjarDiditControlled\.start\(\)/,'provider session is initiated only by member button');
assert.match(panel,/No earlier Didit approval request/,'member copy explains bypass of old reuse enquiry');
assert.match(client,/directPilot\?: boolean/,'UI receives only the server-verified direct-pilot flag');
assert.match(workflow,/\[nightjar-didit-direct-meg-release\]/,'production path deploys the backend before the UI');
console.log('Meg direct Didit pilot: one-use consent, account binding, pause and backend-first release checks PASS.');
