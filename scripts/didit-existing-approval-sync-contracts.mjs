import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend=fs.readFileSync('functions/src/index.ts','utf8');
const provider=fs.readFileSync('functions/src/didit.ts','utf8');
const dashboard=fs.readFileSync('src/components/AdminDiditMemberOps.tsx','utf8');
const api=fs.readFileSync('src/platform/firebase-administration.ts','utf8');
const hostingWorkflow=fs.readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const member=backend.slice(backend.indexOf('export const reconcileMyDiditVerification = onCall'),
  backend.indexOf('// Owner-only read-only evidence trail'));
const owner=backend.slice(backend.indexOf('export const adminReconcileMemberDidit = onCall'),
  backend.indexOf('// Admin-only, bounded Nightjar member verification directory'));
const receipt=provider.slice(provider.indexOf('export const processDiditWebhook = onDocumentCreated'));

assert.match(member,/session\.uid !== identity\.uid/,'member sync only uses their own session');
assert.match(member,/decision\.vendor_data !== identity\.uid/,'user binding remains mandatory');
assert.match(member,/decision\.workflow_id !== session\.workflowId/,'workflow binding remains mandatory');
assert.match(member,/decision\.environment !== 'live'/,'no sandbox unlock');
assert.match(member,/decision\.session_kind !== 'user'/,'no KYB unlock');
assert.match(owner,/session\.uid !== userId/,'admin can only reconcile linked account');
assert.match(owner,/decision\.vendor_data !== userId/,'admin provider read matches selected member');
assert.match(owner,/decision\.workflow_id !== session\.workflowId/,'admin workflow binding remains mandatory');
assert.match(owner,/decision\.environment !== 'live'/,'no sandbox unlock via owner');
assert.match(owner,/verifiedAdultFromDecision\(decision\)/,'overall provider Approved is insufficient');
assert.match(member,/verifiedAdultFromDecision\(decision\)/,'member must prove adult documentary evidence');
assert.match(owner,/method: 'GET'/,'owner sync GET-only');
assert.match(member,/method: 'GET'/,'member sync GET-only');
assert.doesNotMatch(owner,/method: 'POST'|startDiditSession\(/,'owner sync must not start a paid session');
assert.doesNotMatch(member,/method: 'POST'|startDiditSession\(/,'member sync must not start a paid session');
assert.match(member,/session\.applicationId && decision\.application_id != null/,'member accepts missing optional application-id echo');
assert.match(owner,/session\.applicationId && decision\.application_id != null/,'owner accepts missing optional application-id echo');
assert.match(provider,/session\.applicationId && payload\.applicationId && session\.applicationId !== payload\.applicationId/,
  'signed webhook accepts missing optional application-id echo but rejects a mismatch');
assert.match(owner,/evidenceIssue/,'admin gets safe age-evidence categories');
assert.match(owner,/birth_date_not_returned/,'missing DOB is diagnosed without bypass');
assert.match(owner,/id_step_not_approved/,'manual approval does not override ID step');
assert.doesNotMatch(owner,/return\s*\{\s*date_of_birth|console\.log|console\.error|console\.warn/,
  'raw ID data never leaves provider read');
assert.match(api,/evidenceIssue\?:/,'client understands safe diagnostic field');
assert.match(dashboard,/syncPendingExisting = async/,'admin provides guided multi-member recovery');
assert.match(dashboard,/inspectDiditMemberCase\(member\.userId\)/,'check account/session binding before each read');
assert.match(dashboard,/syncApplicantExistingDidit\(member\.userId\)/,'reuse existing secured callable');
assert.match(dashboard,/\.slice\(0,8\)/,'bounded admin reconciliation batch');
assert.match(dashboard,/window\.confirm\(/,'owner explicitly approves running read-only reconciliation');
assert.doesNotMatch(dashboard,/startAgeAssurance|startDiditSession|startMyDiditControlledCheck/,
  'no UI path creates a new paid verification');
assert.match(hostingWorkflow,/\[nightjar-didit-sync-repair-release\]/,'explicit backend release tag is required');
assert.match(hostingWorkflow,/inputs\[function_names\]=processDiditWebhook,reconcileMyDiditVerification,adminReconcileMemberDidit/,
  'only the three changed Didit backend callables are deployed before Hosting');
console.log('Didit existing-approval sync and no-charge recovery contracts PASS');
