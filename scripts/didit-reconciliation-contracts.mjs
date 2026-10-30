import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend=fs.readFileSync('functions/src/index.ts','utf8');
const didit=fs.readFileSync('functions/src/didit.ts','utf8');
const client=fs.readFileSync('src/platform/firebase-age.ts','utf8');
const control=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
const workflow=fs.readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const begin=backend.indexOf('export const adminReconcileDiditApproval = onCall');
const end=backend.indexOf('export const adminDiditDiagnostics = onCall',begin);
assert.ok(begin>0 && end>begin,'owner recovery must be an independent callable');
const fn=backend.slice(begin,end);
assert.match(fn,/requireAdminIdentity\(request\)/,'only server-validated owner access allowed');
assert.match(fn,/DIDIT_VERIFICATION_PAUSED/,'feature is maintenance-only');
assert.match(fn,/claimSnap\.data\(\)\?\.initiatedByUid !== identity\.uid/,'the initiating administrator is the only allowed account');
assert.match(fn,/session\.uid !== identity\.uid/,'cannot reconcile another account session');
assert.match(fn,/sessionId = cleanText\(currentAge\.sessionId/,'session is looked up only from authenticated account');
assert.match(fn,/session\.workflowId !== DIDIT_WORKFLOW_ID\.value\(\)/,'workflow scope cannot be spoofed');
assert.match(fn,/session\.createdAtMs < claimedAtMs - 60000/,'session tied to maintenance claim');
assert.match(fn,/https:\/\/verification\.didit\.me\/v3\/session\//,'decision read uses official Didit session API');
assert.match(fn,/method: 'GET'/,'reconciliation reads only a pre-existing decision');
assert.doesNotMatch(fn,/method: 'POST'|startDiditSession\(|startAgeAssurance\(|fetch\('https:\/\/verification\.didit\.me\/v3\/session\/'\s*,/,
  'never create an additional chargeable verification session');
assert.match(fn,/decision\.vendor_data !== identity\.uid/,'fetched response must bind to caller');
assert.match(fn,/decision\.workflow_id !== session\.workflowId/,'fetched response must bind to known workflow');
assert.match(fn,/decision\.session_id !== sessionId/,'fetched response must bind to stored session');
assert.match(fn,/decision\.environment !== 'live'/,'sandbox results cannot grant verification');
assert.match(fn,/decision\.session_kind !== 'user'/,'business verification does not unlock listeners');
assert.match(fn,/\['Approved', 'APPROVED'\]\.includes\(String\(decision\.status\)\)/,'provider must explicitly approve');
assert.match(fn,/verifiedAdultFromDecision\(decision\)/,'approved documentary 18+ evidence required');
assert.match(didit,/export const verifiedAdultFromDecision/,'same age validator used for live webhook approval');
assert.match(fn,/db\.runTransaction/,'account verification update must be atomic');
assert.match(fn,/Number\(ageNow\.diditEventCreatedAt \?\? 0\) !== previousEventTime/,'superseded decision is rejected');
assert.match(fn,/diditEventCreatedAt: Math\.floor\(Date\.now\(\) \/ 1000\)/,'stale webhook events cannot override a reconciled current approval');
assert.match(fn,/verificationEvidenceSource: 'didit-authenticated-session-read'/,'audit marker never masquerades as a signed webhook');
assert.doesNotMatch(fn,/console\.log|console\.error|\.set\(\{\s*decision:|rawBody|document_number|source_image|date_of_birth|session_url|face_matches/,
  'raw identity documents, images and provider decisions must never be logged or persisted');
assert.match(client, /async reconcileExistingApproval\(/,'client exposes explicit safe recovery action');
assert.match(control, /window\.confirm\(/,'owner must explicitly opt in before authenticated state change');
assert.match(control, /Recover my existing Didit approval/,'owner control must be labelled clearly');
assert.doesNotMatch(control,/nightjarAge\.start\(/,'dashboard must not open an ID session');
assert.match(workflow, /\[nightjar-didit-reconciliation-release\]/,'backend-first deploy guard is required');
assert.match(backend,/const DIDIT_VERIFICATION_PAUSED = false/,'standard account-bound age verification is enabled');
// All-member read-only recovery shares the established authenticated provider
// evidence path, without allowing a member to select another account/session.
const memberStart=backend.indexOf('export const reconcileMyDiditVerification = onCall');
const memberEnd=backend.indexOf('// Owner-only read-only evidence trail',memberStart);
assert.ok(memberStart>0 && memberEnd>memberStart,'member recovery is a standalone callable');
const member=backend.slice(memberStart,memberEnd);
const memberClient=fs.readFileSync('src/platform/firebase-didit-controlled.ts','utf8');
const memberPanel=fs.readFileSync('src/components/DiditControlledLiveCheck.tsx','utf8');
assert.match(member,/await requireActiveIdentity\(request\)/,'only the current authenticated member can reconcile');
assert.match(member,/const sessionId = cleanText\(age\.sessionId/,'session is read from the caller account');
assert.match(member,/session\.uid !== identity\.uid/,'session belongs to authenticated member');
assert.match(member,/session\.workflowId !== DIDIT_WORKFLOW_ID\.value\(\)/,'server configured workflow');
assert.match(member,/method: 'GET'/,'member recovery only reads the existing decision');
assert.doesNotMatch(member,/method: 'POST'|startDiditSession\(/,'never starts an additional paid provider check');
assert.match(member,/decision\.session_id !== sessionId/,'response session binding');
assert.match(member,/decision\.vendor_data !== identity\.uid/,'response account binding');
assert.match(member,/decision\.workflow_id !== session\.workflowId/,'response workflow binding');
assert.match(member,/decision\.environment !== 'live'/,'sandbox results cannot unlock adult access');
assert.match(member,/decision\.session_kind !== 'user'/,'business decisions do not qualify');
assert.match(member,/verifiedAdultFromDecision\(decision\)/,'approved documentary evidence must prove adulthood');
assert.match(member,/!\['PENDING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'\]\.includes/,'only active or under-review sessions may be recovered');
assert.match(member,/db\.runTransaction/,'recovery is atomic');
assert.match(member,/Number\(ageNow\.diditEventCreatedAt \?\? 0\) !== previousEventTime/,'newer verification results cannot be overwritten');
assert.match(member,/verificationEvidenceSource:'didit-authenticated-session-read'/,'recovery is distinguishable from a signed webhook');
assert.doesNotMatch(member,/console\.log|console\.error|document_number|date_of_birth|session_url|face_matches/,'never log or store KYC documents');
assert.match(memberClient,/reconcileMyDiditVerification/,'browser calls dedicated existing-decision recovery');
assert.match(memberPanel,/nightjarDiditControlled\.reconcile\(\)/,'member explicitly requests result recovery');
assert.match(memberPanel,/Check my completed Didit result · no new ID check/,'button prevents duplicate charges by design');
assert.doesNotMatch(memberPanel,/onClick=\{\(\)=>void begin\(\)\}[^\n]*Check my completed/,'recovery UI cannot start another session');

// Dedicated owner operations. These handlers may inspect saved metadata and
// authenticated existing provider evidence, but never create another check,
// expose DOB/ID/selfies, or approve a professional role.
const operations=backend.slice(backend.indexOf('export const adminReconcileMemberDidit = onCall'),
  backend.indexOf('// Owner-only read-only evidence trail'));
assert.match(operations,/const admin = requireAdminIdentity\(request\)/,'member sync requires server-side owner identity');
assert.match(operations,/const userId = cleanText\(/,'a selected account is the only target');
assert.match(operations,/session\.uid !== userId/,'existing session belongs to selected account');
assert.match(operations,/session\.workflowId !== DIDIT_WORKFLOW_ID\.value\(\)/,'workflow binding required');
assert.match(operations,/decision\.vendor_data !== userId/,'provider decision must match selected member');
assert.match(operations,/decision\.session_id !== sessionId/,'provider decision must match stored session');
assert.match(operations,/decision\.environment !== 'live'/,'sandbox provider decision cannot unlock');
assert.match(operations,/verifiedAdultFromDecision\(decision\)/,'overall Approved alone does not grant adult access');
assert.match(operations,/method: 'GET'/,'recheck uses GET only');
assert.doesNotMatch(operations,/method: 'POST'|startDiditSession\(|startAgeAssurance\(/,'admin cannot start a new billable Didit check by syncing');
assert.match(operations,/db\.runTransaction/,'result is saved with atomic session/version checks');
assert.match(operations,/diditAdminReconciliations/,'owner action leaves an audit trail');
assert.doesNotMatch(operations,/\.set\(\{\s*decision:|console\.log|console\.error|face_image|date_of_birth:/,'no raw identity evidence stored/logged');
const desk=fs.readFileSync('src/components/AdminDiditMemberOps.tsx','utf8');
const adminApi=fs.readFileSync('src/platform/firebase-administration.ts','utf8');
const controlCentre=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
assert.match(backend,/export const adminListDiditMemberCases = onCall/,'owner-only verification directory exists');
assert.match(backend,/export const adminInspectDiditMemberCase = onCall/,'member-specific evidence diagnostics exists');
assert.match(adminApi,/adminReconcileMemberDidit/,'owner client uses only established existing result API');
assert.match(adminApi,/adminListDiditMemberCases/,'owner directory is authenticated');
assert.match(adminApi,/adminInspectDiditMemberCase/,'owner can read per-member webhook evidence');
assert.match(desk,/nightjarAdministration\.syncApplicantExistingDidit/,'member desk provides safe per-account recheck');
assert.match(desk,/window\.confirm/,'operator confirms the target member before provider check');
assert.match(desk,/onVerified\?\.\(\)/,'a successful result can refresh the relevant owner view');
assert.match(controlCentre,/<AdminDiditMemberOps/,'verification desk is integrated into the admin Didit workspace');
assert.match(workflow,/\[nightjar-didit-ops-release\]/,'backend-first Didit operations release is required');

console.log('Nightjar secure one-shot existing Didit approval reconciliation contracts PASS.');
