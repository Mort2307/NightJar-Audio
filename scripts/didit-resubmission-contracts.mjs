import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend=fs.readFileSync('functions/src/didit-resubmissions.ts','utf8');
const diditStarter=fs.readFileSync('functions/src/didit.ts','utf8');
const entry=fs.readFileSync('functions/src/index.ts','utf8');
const policy=fs.readFileSync('functions/src/didit-resubmission-guards.ts','utf8');
const member=fs.readFileSync('src/components/DiditDocumentResubmission.tsx','utf8');
const admin=fs.readFileSync('src/components/AdminDiditResubmissions.tsx','utf8');
const panel=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const api=fs.readFileSync('src/platform/firebase-didit-resubmission.ts','utf8');

assert.match(entry,/buildDiditResubmissionCallables\(/,'callables must be exposed');
const memberRecovery=entry.slice(entry.indexOf('export const reconcileMyDiditVerification = onCall'),
  entry.indexOf('// Owner-triggered recovery for a specific, registered Nightjar member'));
const adminRecovery=entry.slice(entry.indexOf('export const adminReconcileMemberDidit = onCall'),
  entry.indexOf('// Admin-only, bounded Nightjar member verification directory'));
assert.match(memberRecovery,/status:'PENDING_REVIEW'/,'member sync persists a review state when overall Approved lacks documentary adult evidence');
assert.match(adminRecovery,/status:'PENDING_REVIEW'/,'owner sync persists the same review state for the selected member');
assert.match(memberRecovery,/diditDecisionSyncOutcome:'adult_evidence_missing'/,'only a safe categorical evidence outcome is stored');
assert.match(memberRecovery,/verified:false, reverifyRequired:true/,'missing evidence remains blocked from 18+');

assert.match(backend,/await deps\.requireActiveIdentity\(request\)/,'member status/request use trusted auth');
assert.match(backend,/deps\.requireAdminIdentity\(request\)/,'admin queue/review use server auth');
assert.match(backend,/if \(uid === admin\.uid\)/,'admin cannot approve their own request');
assert.match(backend,/item\.status !== 'requested' \|\| Number\(item\.revision\) !== revision/,'stale review rejected');
assert.match(backend,/tx\.update\(r,\{\s*status:'processing', claimId/,'atomic durable claim before provider call');
assert.match(backend,/where\('status','in',\['requested','processing','needs_manual_review'\]\)/,
  'uncertain outcomes remain visible to administrators without automatic retry');
assert.match(backend,/MAX_PROVIDER_REQUESTS = 2/,'hard account/session provider cap');
assert.match(backend,/MAX_MEMBER_REQUESTS = 3/,'member request spam cap');
assert.match(backend,/explicitConsent !== true/,'member explicit consent');
assert.match(backend,/acknowledgedPossibleCharge !== true/,'admin cost acknowledgment');
assert.match(backend,/decision\.vendor_data !== uid/,'provider result is account bound');
assert.match(backend,/decision\.workflow_id !== data\.workflowId/,'provider result is workflow bound');
assert.match(backend,/decision\.session_kind !== 'user'/,'only individual KYC accepted');
assert.match(backend,/freshAge\.sessionId!==data\.sessionId/,'pre-write stale state rejected');
assert.match(backend,/isAccountBound\(uid,freshAge,freshSession\)/,'recheck account binding immediately before provider PATCH');
assert.match(backend,/new_status:'Resubmitted'/,'provider receives same-session resubmission');
assert.match(backend,/nodes_to_resubmit:\[\{node_id:selection\.nodeId,feature:'OCR'\}\]/,
  'only one provider-selected document OCR step may be repeated');
assert.match(backend,/send_email:false/,'no unreviewed provider email or PII disclosure');
assert.match(diditStarter,/const recovered = await recoverExistingDiditSession\(uid\)/,
  'existing provider sessions are recovered before any new billable session POST');
assert.match(diditStarter,/if \(recovered\) return recovered/,
  'recovered terminal or active sessions stop a duplicate paid session creation');
assert.match(app,/!\['FAIL','ABANDONED','EXPIRED','PENDING_REVIEW'\]\.includes\(ageProviderStatus\)/,
  'failed existing check must not show the start-new-check action');
assert.match(policy,/id\.status==='Approved'/,'approved ID missing DOB must halt');
assert.match(policy,/ids\.length!==1/,'ambiguous ID steps halt');
assert.match(policy,/id\.verification_method !== 'document'/,'no wallet/lookup repeat');
assert.match(policy,/lastProviderRequestMs\+24\*60\*60\*1000/,'24h cooldown');
assert.doesNotMatch(backend,/startDiditSession\(|\/v3\/session\/['"]\s*,\s*\{\s*method:'POST'/,
  'resubmissions never create new provider sessions');
assert.doesNotMatch(backend,/console\.(?:log|warn|error)|date_of_birth|document_number|source_image|face_image/,
  'never log or persist raw identity evidence');
assert.match(api,/myDiditResubmission/);
assert.match(api,/requestDiditResubmission/);
assert.match(api,/adminReviewDiditResubmission/);
assert.match(member,/Request document review/);
assert.match(member,/nightjarDiditResubmission\.request\(reason\)/);
assert.match(member,/original, real physical identity document/,'member receives physical-document-only guidance');
assert.match(member,/screenshot, scan, photocopy, printout/,'member is explicitly told not to use copies or screen images');
assert.match(member,/even natural light/,'member receives natural-light guidance');
assert.match(member,/all four corners visible/,'member receives full-frame guidance');
assert.match(member,/both front and back/,'member is told to capture both sides when requested');
assert.match(member,/Continue to your document retake/,'member has a direct action to resume the existing resubmitted session');
assert.match(member,/only the selected step/,'member is told Didit will repeat only the selected step');
assert.match(backend,/describeDiditDocumentIssue/,'member status uses whitelisted provider issue guidance');
assert.match(backend,/decision\.session_id === age\.sessionId/,'guidance decision is bound to the current session');
assert.match(backend,/guidance\?\.canRetake === true/,'unknown and non-document failures cannot trigger blind resubmission');
assert.match(policy,/IMAGE_TOO_BLURRY/,'known Didit image warnings are mapped');
assert.match(policy,/IMAGE_TOO_DARK/,'dark image warning is mapped');
assert.match(policy,/IMAGE_TOO_BRIGHT/,'bright image warning is mapped');
assert.match(policy,/DOCUMENT_EXPIRED/,'expired document warning is mapped');
assert.match(policy,/adult_evidence_missing/,'missing adult evidence is not mislabelled as a photo problem');

assert.match(admin,/window\.confirm\(question\)/);
assert.match(admin,/Approve one ID resubmission/);
assert.match(panel,/<AdminDiditResubmissions \/>/);
assert.match(app,/await refreshAgeStatus\(\);\s*setDiditRecoveryMessage\('Didit recorded an overall approval/,'member recovery refreshes the saved review state so the resubmission panel appears');
assert.match(app,/<DiditDocumentResubmission \/>/);
assert.doesNotMatch(member,/startAgeAssurance|nightjarAge\.start|startDiditSession/,
  'member request must never start paid ID verification');
console.log('Safe Didit same-session resubmission contracts: PASS');
